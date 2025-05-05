import os
import subprocess
import json
import boto3

def main(event, context):
    try:
        # Run the Playwright test
        process = subprocess.run(['npx', 'playwright', 'test', 'e2e/login.test.ts'],
                                  capture_output=True, text=True, check=True, env=os.environ)

        print("Test output:", process.stdout)

        # If the test passes, do nothing
        if "tests passed" in process.stdout:
            print("E2E test passed")
            return {
                'statusCode': 200,
                'body': json.dumps('E2E test passed!')
            }
        else:
            raise Exception("E2E test failed")

    except subprocess.CalledProcessError as e:
        print("Test failed with error:", e.stderr)
        send_sns_notification(e.stderr)
        return {
            'statusCode': 500,
            'body': json.dumps(f'E2E test failed: {e.stderr}')
        }
    except Exception as e:
        print("Test failed with exception:", str(e))
        send_sns_notification(str(e))
        return {
            'statusCode': 500,
            'body': json.dumps(f'E2E test failed: {str(e)}')
        }

def send_sns_notification(message):
    sns_topic_arn = os.environ.get('SNS_TOPIC_ARN')
    if sns_topic_arn:
        sns_client = boto3.client('sns')
        try:
            sns_client.publish(
                TopicArn=sns_topic_arn,
                Message=message,
                Subject='E2E Test Failed'
            )
            print("SNS notification sent")
        except Exception as e:
            print("Failed to send SNS notification:", str(e))
    else:
        print("SNS_TOPIC_ARN environment variable not set. Skipping SNS notification.")