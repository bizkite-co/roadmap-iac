#!/bin/bash
set -x

# Use the PROD server address from the environment variable $prod
# Ensure the .envrc file is sourced to set this variable
if [ -z "$prod" ]; then
    echo "Error: PROD server address not set. Please ensure \$prod is exported in your environment (e.g., via .envrc)."
    exit 1
fi

PROD_SERVER_ADDRESS="$prod"
TOMCAT_HOME="/opt/tomcat/apache-tomcat-9.0.53"
WEBAPPS_DIR="$TOMCAT_HOME/webapps"
BIN_DIR="$TOMCAT_HOME/bin"
LIB_DIR="$TOMCAT_HOME/lib"
LOCAL_WAR_PATH="./build/libs/roadmap.war" # Explicit WAR file path
LOCAL_SETENV_PATH="./tomcat/bin/setenv.sh"
LOCAL_LOGBACK_PATH="./tomcat/lib/logback.xml"
REMOTE_VERSION_FILE="$WEBAPPS_DIR/roadmap/WEB-INF/classes/version.properties"
REMOTE_LOGS_DIR="$TOMCAT_HOME/logs"
REMOTE_APP_DIR="$WEBAPPS_DIR/roadmap"
REMOTE_TEMP_DIR="/tmp/roadmap-deploy"
WHITELISTED_IP="104.32.208.200"

echo "Deploying to PROD server: $PROD_SERVER_ADDRESS"

# Get the public IP address
PUBLIC_IP=$(curl -s ifconfig.me)
echo "Public IP address: $PUBLIC_IP"

# Check if the public IP address is in the whitelist
if [ "$PUBLIC_IP" == "$WHITELISTED_IP" ]; then
  echo "Using SSH to connect to PROD server."
  USE_SSM=false
else
  echo "Using SSM to connect to PROD server."
  USE_SSM=true
fi

# Step 3.5: Remove temporary directory creation
echo "Skipping temporary directory creation."

# Step 4: Copy WAR file if different
echo "Copying WAR file if different..."

# Extract local version from WAR file
LOCAL_VERSION=$(unzip -p "$LOCAL_WAR_PATH" version.properties 2>/dev/null)
# Trim leading/trailing whitespace and newlines
LOCAL_VERSION=$(echo "$LOCAL_VERSION" | xargs)

../auto-start-stop-ec2/scripts/copy_if_different.sh "$PROD_SERVER_ADDRESS" "$LOCAL_WAR_PATH" "$WEBAPPS_DIR/roadmap.war" "$WEBAPPS_DIR/roadmap.war"
if [ $? -ne 0 ]; then
    echo "Failed to copy WAR file."
    exit 1
fi
echo "WAR file copied successfully."

# Step 5: Copy setenv.sh if different
echo "Copying setenv.sh if different..."
../auto-start-stop-ec2/scripts/copy_if_different.sh "$PROD_SERVER_ADDRESS" "$LOCAL_SETENV_PATH" "$BIN_DIR/setenv.sh" "$BIN_DIR/setenv.sh"
if [ $? -ne 0 ]; then
    echo "Failed to copy setenv.sh to temporary location."
    exit 1
fi
echo "setenv.sh copied successfully."

# Step 6: Copy logback.xml if different
echo "Copying logback.xml if different..."
# Remove TEST_FILE appender from logback.xml
sed -i '/TEST_FILE/,/<\/appender>/d' "$LOCAL_LOGBACK_PATH"
../auto-start-stop-ec2/scripts/copy_if_different.sh "$PROD_SERVER_ADDRESS" "$LOCAL_LOGBACK_PATH" "$LIB_DIR/logback.xml" "$LIB_DIR/logback.xml"
if [ $? -ne 0 ]; then
    echo "Failed to copy logback.xml."
    exit 1
fi
echo "logback.xml copied successfully."

# Step 8.5: Ensure deployed application directory has correct ownership on PROD server after Tomcat extraction
echo "Ensuring deployed application directory has correct ownership on PROD server after Tomcat extraction using SSM..."
if $USE_SSM; then
  aws ssm send-command \
      --instance-ids "i-0f198e6c934ad731c" \
      --document-name "AWS-RunShellScript" \
      --parameters "commands=sudo chown -R tomcat:tomcat $REMOTE_APP_DIR" \
      --region "$AWS_REGION" \
      --output text
else
  ssh "$PROD_SERVER_ADDRESS" "sudo chown -R tomcat:tomcat $REMOTE_APP_DIR"
fi
if [ $? -ne 0 ]; then
    echo "Failed to set ownership for deployed application directory after startup."
    exit 1
fi
echo "Deployed application directory ownership set successfully."

# Step 9: Verify deployed version on PROD
echo "Verifying deployed version on PROD using SSM..."
if $USE_SSM; then
  # Send command to get version and capture CommandId
  SSM_COMMAND_OUTPUT=$(aws ssm send-command \
      --instance-ids "i-0f198e6c934ad731c" \
      --document-name "AWS-RunShellScript" \
      --parameters "commands=sudo unzip -p $WEBAPPS_DIR/roadmap.war version.properties 2>/dev/null" \
      --region "$AWS_REGION" \
      --output json)

  SSM_COMMAND_ID=$(echo "$SSM_COMMAND_OUTPUT" | jq -r '.Command.CommandId')

  # Wait for command to complete and get output
  COMMAND_STATUS=""
  while [[ "$COMMAND_STATUS" != "Success" && "$COMMAND_STATUS" != "Failed" && "$COMMAND_STATUS" != "Cancelled" && "$COMMAND_STATUS" != "TimedOut" ]]; do
    sleep 5
    COMMAND_INVOCATION_OUTPUT=$(aws ssm get-command-invocation \
        --command-id "$SSM_COMMAND_ID" \
        --instance-id "i-0f198e6c934ad731c" \
        --region "$AWS_REGION" \
        --output json)
    COMMAND_STATUS=$(echo "$COMMAND_INVOCATION_OUTPUT" | jq -r '.Status')
  done

  if [ "$COMMAND_STATUS" != "Success" ]; then
    echo "Error: SSM command to get version failed with status $COMMAND_STATUS."
    exit 1
  fi

  REMOTE_VERSION=$(echo "$COMMAND_INVOCATION_OUTPUT" | jq -r '.StandardOutputContent')
  # Trim leading/trailing whitespace and newlines
  REMOTE_VERSION=$(echo "$REMOTE_VERSION" | xargs)

else
  REMOTE_VERSION=$(ssh "$PROD_SERVER_ADDRESS" "sudo cat $REMOTE_VERSION_FILE 2>/dev/null")
fi

if [ -z "$REMOTE_VERSION" ]; then
    echo "Error: Could not read version.properties from PROD server."
    exit 1
fi

echo "Local version: $LOCAL_VERSION"
echo "PROD version: $REMOTE_VERSION"
if [ "$LOCAL_VERSION" == "$REMOTE_VERSION" ]; then
        echo "Version verification successful: Local and PROD versions match."
    else
        echo "Version verification failed: Local and PROD versions do NOT match."
        exit 1
    fi

echo "Deployment process complete."
