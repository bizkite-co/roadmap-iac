import os
import subprocess
import json
import boto3
import stat

# Environment variables
GIT_REPO_URL = os.environ['GIT_REPO_URL']
SECRET_NAME = os.environ['SECRET_NAME']
SNS_TOPIC_ARN = os.environ.get('SNS_TOPIC_ARN')

def main(event, context):
    try:
        # Create a temporary directory for the checkout
        tmp_dir = '/tmp/repo'
        subprocess.run(['rm', '-rf', tmp_dir], check=True)
        subprocess.run(['mkdir', '-p', tmp_dir], check=True)

        # Clone the repository
        print(f'Cloning repository: {GIT_REPO_URL}')
        subprocess.run(['git', 'clone', GIT_REPO_URL, tmp_dir], check=True)

        # Fetch credentials from Secrets Manager
        print(f'Fetching secret: {SECRET_NAME}')
        password = get_secret(SECRET_NAME)

        # Create the config.toml file
        config_content = f'''
[user]
email = "test@bizkite.net"
username = "appdev"
password = "{password}"

[s3]
bucketName = "higginbotham-prs-logs"
region = "us-west-1"

[settings]
env = "dev"
'''
        with open(os.path.join(tmp_dir, 'config.toml'), 'w') as f:
            f.write(config_content)
        print('Successfully created config.toml')

        # Install dependencies
        print('Installing npm dependencies...')
        run_command(['npm', 'install'], cwd=tmp_dir)

        # Run the tests
        print('Running E2E tests...')
        run_command(['make', 'test'], cwd=tmp_dir)

        print("E2E tests passed successfully!")
        return {
            'statusCode': 200,
            'body': json.dumps('E2E tests passed successfully!')
        }

    except Exception as e:
        print(f"An error occurred: {str(e)}")
        send_sns_notification(str(e))
        return {
            'statusCode': 500,
            'body': json.dumps(f'E2E test failed: {str(e)}')
        }

def get_secret(secret_name):
    client = boto3.client('secretsmanager')
    try:
        response = client.get_secret_value(SecretId=secret_name)
        return response['SecretString']
    except Exception as e:
        print(f"Failed to retrieve secret '{secret_name}': {str(e)}")
        raise

def run_command(command, cwd):
    process = subprocess.run(command, capture_output=True, text=True, cwd=cwd)
    if process.returncode != 0:
        print(f"Command failed: {' '.join(command)}")
        print(f"Stdout:\n{process.stdout}")
        print(f"Stderr:\n{process.stderr}")
        raise Exception(f"Command failed with error:\n{process.stderr}")
    print(process.stdout)

def send_sns_notification(message):
    if not SNS_TOPIC_ARN:
        print("SNS_TOPIC_ARN not set. Skipping notification.")
        return

    print("Sending SNS failure notification...")
    sns_client = boto3.client('sns')
    try:
        sns_client.publish(
            TopicArn=SNS_TOPIC_ARN,
            Message=f"E2E test execution failed.\n\nDetails:\n{message}",
            Subject='E2E Test Run Failed'
        )
        print("SNS notification sent.")
    except Exception as e:
        print(f"Failed to send SNS notification: {str(e)}")
