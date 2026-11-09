import boto3
import os
import logging
import json
import ssl
import socket
import datetime
import http.client

logger = logging.getLogger()
logger.setLevel(logging.INFO)

sns_client = boto3.client('sns')

def send_sns_notification(subject, message):
    """Sends a notification to the configured SNS topic."""
    sns_topic_arn = os.environ.get('SNS_TOPIC_ARN')
    if sns_topic_arn:
        try:
            sns_client.publish(
                TopicArn=sns_topic_arn,
                Subject=subject,
                Message=message
            )
            logger.info(f"SNS notification sent: {subject}")
        except Exception as e:
            logger.error(f"Failed to send SNS notification: {e}")
    else:
        logger.warning("SNS_TOPIC_ARN environment variable not set. Skipping SNS notification.")

def get_certificate_details(hostname, port=443):
    """Connects to a host and retrieves parsed certificate details."""
    try:
        context = ssl.create_default_context()
        with socket.create_connection((hostname, port)) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                expiry_date_str = cert['notAfter']
                expiry_date = datetime.datetime.strptime(expiry_date_str, '%b %d %H:%M:%S %Y %Z')
                subject = cert.get('subject', ())
                issuer = cert.get('issuer', ())
                san_entries = cert.get('subjectAltName', ())
                sans = [entry[1] for entry in san_entries if len(entry) > 1 and entry[0] == 'DNS']

                common_name = None
                for rdn in subject:
                    for attr_name, attr_value in rdn:
                        if attr_name == 'commonName':
                            common_name = attr_value
                            break
                    if common_name:
                        break

                issuer_string = ', '.join(
                    f"{name}={value}"
                    for rdn in issuer
                    for name, value in rdn
                )

                return {
                    'expiry_date': expiry_date,
                    'common_name': common_name,
                    'sans': sans,
                    'issuer': issuer_string,
                }
    except (socket.gaierror, socket.timeout, ConnectionRefusedError) as conn_err:
        logger.warning(f"Connection failed for {hostname}:{port} (host is likely down): {conn_err}")
        return "HOST_DOWN"
    except Exception as e:
        logger.error(f"Error retrieving certificate for {hostname}:{port}: {e}")
        return None

def get_https_headers(hostname, path='/', port=443):
    try:
        conn = http.client.HTTPSConnection(hostname, port=port, timeout=15)
        conn.request('HEAD', path, headers={'Host': hostname, 'User-Agent': 'certificate-health-check/1.0'})
        response = conn.getresponse()
        headers = {k.lower(): v for k, v in response.getheaders()}
        return {
            'status': response.status,
            'headers': headers,
        }
    except Exception as e:
        logger.error(f"Error retrieving HTTPS headers for {hostname}:{port}{path}: {e}")
        return None
    finally:
        try:
            conn.close()
        except Exception:
            pass

def hostname_matches_expected(cert_details, expected_hostname):
    sans = cert_details.get('sans', [])
    common_name = cert_details.get('common_name')

    if expected_hostname in sans:
        return True

    if common_name == expected_hostname:
        return True

    labels = expected_hostname.split('.')
    if len(labels) > 2:
        wildcard_candidate = '*.' + '.'.join(labels[1:])
        if wildcard_candidate in sans or common_name == wildcard_candidate:
            return True

    return False

def main(event, context):
    """
    Lambda handler to perform certificate health checks.
    Reads domain names from environment variables and checks their certificates.
    """
    domains_to_check_str = os.environ.get('DOMAINS_TO_CHECK')
    if not domains_to_check_str:
        logger.error("DOMAINS_TO_CHECK environment variable not set.")
        send_sns_notification("Certificate Health Check Failed", "DOMAINS_TO_CHECK environment variable not set.")
        return {
            'statusCode': 500,
            'body': 'Domains to check not configured.'
        }

    try:
        domains_to_check = json.loads(domains_to_check_str)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse DOMAINS_TO_CHECK environment variable: {e}")
        send_sns_notification("Certificate Health Check Failed", f"Failed to parse DOMAINS_TO_CHECK environment variable: {e}")
        return {
            'statusCode': 500,
            'body': 'Invalid format for domains to check.'
        }

    all_checks_passed = True
    failed_checks = []
    warning_checks = []

    for domain_info in domains_to_check:
        hostname = domain_info.get('hostname')
        port = domain_info.get('port', 443)
        expected_path = domain_info.get('expected_path', '/')
        expected_issuer_contains = domain_info.get('expected_issuer_contains')
        require_cloudfront = domain_info.get('require_cloudfront', False)

        if not hostname:
            logger.warning(f"Skipping domain check due to missing hostname in config: {domain_info}")
            continue

        logger.info(f"Checking certificate for {hostname}:{port}")
        cert_details = get_certificate_details(hostname, port)

        if cert_details == "HOST_DOWN":
            logger.info(f"Host {hostname}:{port} is down. Skipping certificate check to prevent false alarms.")
        elif cert_details:
            expiry_date = cert_details['expiry_date']
            logger.info(f"Certificate for {hostname} expires on: {expiry_date}")
            time_until_expiry = expiry_date - datetime.datetime.now(expiry_date.tzinfo)
            if time_until_expiry.total_seconds() < 30 * 24 * 3600:
                warning_message = f"Certificate for {hostname} expires soon ({expiry_date})."
                logger.warning(warning_message)
                warning_checks.append(warning_message)

            if not hostname_matches_expected(cert_details, hostname):
                error_message = (
                    f"Certificate served for {hostname} does not match hostname. "
                    f"CN={cert_details.get('common_name')} SANs={cert_details.get('sans')}"
                )
                logger.error(error_message)
                failed_checks.append(error_message)
                all_checks_passed = False

            if expected_issuer_contains and expected_issuer_contains not in cert_details.get('issuer', ''):
                error_message = (
                    f"Certificate issuer for {hostname} did not contain '{expected_issuer_contains}'. "
                    f"Actual issuer: {cert_details.get('issuer')}"
                )
                logger.error(error_message)
                failed_checks.append(error_message)
                all_checks_passed = False

            header_result = get_https_headers(hostname, expected_path, port)
            if not header_result:
                error_message = f"Failed to retrieve HTTPS headers for {hostname}:{port}{expected_path}."
                logger.error(error_message)
                failed_checks.append(error_message)
                all_checks_passed = False
            else:
                status = header_result['status']
                headers = header_result['headers']
                if status >= 500:
                    error_message = f"HTTPS endpoint for {hostname}{expected_path} returned server error status {status}."
                    logger.error(error_message)
                    failed_checks.append(error_message)
                    all_checks_passed = False

                if require_cloudfront:
                    via_header = headers.get('via', '')
                    x_cache = headers.get('x-cache', '')
                    if 'cloudfront' not in via_header.lower() and 'cloudfront' not in x_cache.lower():
                        error_message = (
                            f"HTTPS endpoint for {hostname}{expected_path} does not appear to be served through CloudFront. "
                            f"via={via_header!r} x-cache={x_cache!r}"
                        )
                        logger.error(error_message)
                        failed_checks.append(error_message)
                        all_checks_passed = False

        else:
            error_message = f"Failed to retrieve or validate certificate for {hostname}:{port}."
            logger.error(error_message)
            failed_checks.append(error_message)
            all_checks_passed = False

    if failed_checks:
        subject = "Certificate Health Check Failed"
        message = "The following certificate checks failed:\n" + "\n".join(failed_checks)
        send_sns_notification(subject, message)
        return {
            'statusCode': 500,
            'body': json.dumps({'status': 'Failed', 'details': failed_checks})
        }
    elif warning_checks:
        subject = "Certificate Health Check Warning"
        message = "The following certificate checks have warnings:\n" + "\n".join(warning_checks)
        send_sns_notification(subject, message)
        return {
            'statusCode': 200,
            'body': json.dumps({'status': 'Warning', 'details': warning_checks})
        }
    else:
        logger.info("All certificate health checks passed.")
        return {
            'statusCode': 200,
            'body': json.dumps({'status': 'Passed'})
        }
