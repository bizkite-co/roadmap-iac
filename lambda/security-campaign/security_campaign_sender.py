"""Send one campaign recipient per Step Functions task invocation."""

import json
import logging
import os
import re
from datetime import datetime, timezone

import boto3
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

campaign_bucket = os.environ["CAMPAIGN_BUCKET"]
send_log_table = boto3.resource("dynamodb").Table(os.environ["SEND_LOG_TABLE"])
ses = boto3.client("sesv2", region_name=os.environ["SES_REGION"])


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def advance(status, index):
    return {"status": status, "nextIndex": index + 1}


def handler(event, _context):
    campaign_id = str(event.get("campaignId", ""))
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,63}", campaign_id):
        raise ValueError("Invalid campaign id")
    index = event.get("index")
    if not isinstance(index, int) or index < 0:
        raise ValueError("Invalid recipient index")

    # The workflow state and logs carry only a campaign id and index, never PII.
    s3 = boto3.client("s3")
    prefix = f"campaigns/{campaign_id}"
    recipients = json.loads(s3.get_object(
        Bucket=campaign_bucket, Key=f"{prefix}/recipients.json")["Body"].read())
    if not isinstance(recipients, list):
        raise ValueError("Recipient snapshot must be a JSON list")
    if index >= len(recipients):
        return {"status": "DONE", "nextIndex": index}

    recipient = recipients[index]
    if not isinstance(recipient, str) or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", recipient):
        raise ValueError(f"Invalid email at recipient index {index}")
    template = json.loads(s3.get_object(
        Bucket=campaign_bucket, Key=f"{prefix}/message.json")["Body"].read())

    existing = send_log_table.get_item(
        Key={"campaignId": campaign_id, "recipientIndex": index},
        ConsistentRead=True,
    ).get("Item")
    if existing:
        status = existing.get("status")
        if status in ("SENT", "REJECTED"):
            logger.info("Recipient index %s already has terminal status %s", index, status)
            return advance(status, index)
        logger.error("Recipient index %s has unresolved status %s", index, status)
        return advance("AMBIGUOUS", index)

    # Claim this recipient before contacting SES. If the invocation is interrupted
    # after SES may have accepted the message, a retry pauses instead of resending.
    try:
        send_log_table.put_item(
            Item={
                "campaignId": campaign_id,
                "recipientIndex": index,
                "recipient": recipient,
                "status": "SENDING",
                "updatedAt": utc_now(),
            },
            ConditionExpression="attribute_not_exists(campaignId)",
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return advance("AMBIGUOUS", index)
        raise

    try:
        response = ses.send_email(
            FromEmailAddress=os.environ["FROM_ADDRESS"],
            Destination={"ToAddresses": [recipient]},
            ConfigurationSetName=os.environ["SES_CONFIGURATION_SET"],
            Content={
                "Simple": {
                    "Subject": {"Data": template["subject"], "Charset": "UTF-8"},
                    "Body": {
                        "Text": {"Data": template["text"], "Charset": "UTF-8"},
                        "Html": {"Data": template["html"], "Charset": "UTF-8"},
                    },
                }
            },
            EmailTags=[
                {"Name": "CampaignId", "Value": campaign_id},
                {"Name": "RecipientIndex", "Value": str(index)},
            ],
        )
    except ClientError as error:
        code = error.response.get("Error", {}).get("Code", "ClientError")
        # Only recipient/content rejects are terminal per-recipient failures.
        # Account, permission, throttling, and service errors pause for review.
        terminal_reject = code == "MessageRejected"
        status = "REJECTED" if terminal_reject else "UNKNOWN"
        send_log_table.update_item(
            Key={"campaignId": campaign_id, "recipientIndex": index},
            UpdateExpression="SET #status = :status, updatedAt = :updated, errorCode = :code",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":status": status, ":updated": utc_now(), ":code": code},
        )
        logger.error("SES returned %s for recipient index %s (%s)", status, index, code)
        return advance(status if terminal_reject else "AMBIGUOUS", index)
    except BotoCoreError as error:
        # A transport failure can leave acceptance uncertain. Stop the workflow.
        error_code = type(error).__name__
        send_log_table.update_item(
            Key={"campaignId": campaign_id, "recipientIndex": index},
            UpdateExpression="SET #status = :status, updatedAt = :updated, errorCode = :code",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":status": "UNKNOWN", ":updated": utc_now(), ":code": error_code},
        )
        logger.error("SES result unknown for recipient index %s (%s)", index, error_code)
        return advance("AMBIGUOUS", index)

    # Keep this outside the SES exception handler. If SES accepted but this
    # durable write fails, the existing SENDING marker causes a safe pause.
    send_log_table.update_item(
        Key={"campaignId": campaign_id, "recipientIndex": index},
        UpdateExpression="SET #status = :status, updatedAt = :updated, messageId = :message",
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={
            ":status": "SENT",
            ":updated": utc_now(),
            ":message": response["MessageId"],
        },
    )
    logger.info("SES accepted recipient index %s", index)
    return advance("SENT", index)
