import boto3
import os
import logging
import json
import ssl
import socket
import datetime

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

def get_certificate_expiry_date(hostname, port=443):
    """Connects to a host and retrieves the SSL certificate expiry date."""
    try:
        context = ssl.create_default_context()
        with socket.create_connection((hostname, port)) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                # The 'notAfter' field contains the expiry date
                expiry_date_str = cert['notAfter']
                # Parse the date string. Example format: 'Nov 11 12:00:00 2024 GMT'
                # Adjust the format string if necessary based on the actual output
                expiry_date = datetime.datetime.strptime(expiry_date_str, '%b %d %H:%M:%S %Y %Z')
                return expiry_date
    except Exception as e:
        logger.error(f"Error retrieving certificate for {hostname}:{port}: {e}")
        return None

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
        expected_cn = domain_info.get('expected_cn')

        if not hostname:
            logger.warning(f"Skipping domain check due to missing hostname in config: {domain_info}")
            continue

        logger.info(f"Checking certificate for {hostname}:{port}")
        expiry_date = get_certificate_expiry_date(hostname, port)

        if expiry_date:
            logger.info(f"Certificate for {hostname} expires on: {expiry_date}")
            # Check if the certificate is valid for at least 30 days
            time_until_expiry = expiry_date - datetime.datetime.now(expiry_date.tzinfo)
            if time_until_expiry.total_seconds() < 30 * 24 * 3600:
                warning_message = f"Certificate for {hostname} expires soon ({expiry_date})."
                logger.warning(warning_message)
                warning_checks.append(warning_message)

            # Optional: Check if the Common Name (CN) matches the expected value
            # This requires retrieving the certificate details more thoroughly
            # For simplicity, this Lambda currently only checks expiry.
            # A more advanced check would involve parsing the certificate subject.
            # if expected_cn:
            #     # Retrieve certificate details and check CN
            #     pass

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