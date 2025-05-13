import boto3
import os
import time
import logging
import json

logger = logging.getLogger()
logger.setLevel(logging.INFO)

acm = boto3.client('acm')
route53 = boto3.client('route53')
events_client = boto3.client('events')

def get_hosted_zone_id(domain_name):
    """Find the hosted zone ID for a given domain name."""
    paginator = route53.get_paginator('list_hosted_zones')
    for page in paginator.paginate():
        for zone in page['HostedZones']:
            # Check if the domain name is a subdomain of the hosted zone name
            if domain_name.endswith(zone['Name'][:-1]) or domain_name == zone['Name'][:-1]:
                 # Ensure it's a public hosted zone
                if not zone['Config']['PrivateZone']:
                    return zone['Id'].split('/')[-1]
    return None

def check_cname_propagation(domain_name, cname_name, cname_value, hosted_zone_id):
    """Check if the CNAME record has propagated in Route 53."""
    try:
        response = route53.list_resource_record_sets(
            HostedZoneId=hosted_zone_id,
            StartRecordName=cname_name,
            StartRecordType='CNAME'
        )
        for record_set in response.get('ResourceRecordSets', []):
            if record_set['Name'] == cname_name + '.' and record_set['Type'] == 'CNAME':
                # Route 53 stores CNAME values with a trailing dot
                if record_set['ResourceRecords'][0]['Value'] == cname_value + '.':
                    logger.info(f"CNAME record found for {cname_name}")
                    return True
    except Exception as e:
        logger.error(f"Error checking CNAME propagation: {e}")
        return False
    logger.info(f"CNAME record not found for {cname_name}")
    return False

def check_acm_validation_status(certificate_arn):
    """Check the validation status of an ACM certificate."""
    try:
        response = acm.describe_certificate(CertificateArn=certificate_arn)
        domain_validation_options = response['Certificate']['DomainValidationOptions']
        for option in domain_validation_options:
            if option['ValidationStatus'] != 'SUCCESS':
                logger.info(f"Certificate {certificate_arn} validation status for {option['DomainName']}: {option['ValidationStatus']}")
                return False
        logger.info(f"Certificate {certificate_arn} validation status: SUCCESS")
        return True
    except Exception as e:
        logger.error(f"Error checking ACM validation status: {e}")
        return False

def main(event, context):
    """
    Lambda handler to verify DNS propagation and ACM validation.
    Expected event input:
    {
        "certificate_arns": ["arn:aws:acm:us-west-1:123456789012:certificate/...", ...]
    }
    """
    certificate_arns = event.get('certificate_arns', [])
    if not certificate_arns:
        logger.error("No certificate ARNs provided in the event.")
        return {
            'statusCode': 400,
            'body': 'No certificate ARNs provided.'
        }

    all_validated = True
    for cert_arn in certificate_arns:
        logger.info(f"Checking validation status for certificate: {cert_arn}")
        # In a real scenario, you might need to get CNAME details from ACM
        # and check propagation in Route 53 before checking ACM status.
        # For simplicity here, we directly check ACM validation status.
        # ACM automatically checks DNS records if validation method is DNS.
        if not check_acm_validation_status(cert_arn):
            all_validated = False
            # In a real scenario, you might retry or wait before failing

    if all_validated:
        logger.info("All certificates have been successfully validated.")
        # Trigger the next step in the automation (e.g., certificate deployment)
        # This could be done by putting a custom event on EventBridge
        # or invoking another Lambda function.
        # Example: Put a custom event
        try:
            events_client.put_events(
                Entries=[
                    {
                        'Source': 'custom.certificate.automation',
                        'DetailType': 'ACM Certificate Validation Success',
                        'Detail': json.dumps({'certificate_arns': certificate_arns})
                    }
                ]
            )
            logger.info("Successfully put custom EventBridge event.")
        except Exception as e:
            logger.error(f"Error putting custom EventBridge event: {e}")
            # Depending on your retry strategy, you might want to raise the exception
            # or return a failure status here.

        return {
            'statusCode': 200,
            'body': 'All certificates validated and deployment triggered.'
        }
    else:
        logger.warning("Not all certificates have been validated yet.")
        # Depending on the trigger (e.g., scheduled), you might just exit
        # and wait for the next scheduled run or implement retry logic.
        return {
            'statusCode': 202, # Accepted, but not complete
            'body': 'Certificates not yet validated.'
        }