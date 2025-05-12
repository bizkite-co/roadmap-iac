#!/bin/bash

# Script to check if a local certificate file matches a remote private key file on a server.

SERVER="$1"
LOCAL_CERT_PATH="$2"
REMOTE_KEY_PATH="$3"
TEMP_REMOTE_CERT="/tmp/temp_cert_to_check.crt"

if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <server> <local_cert_path> <remote_key_path>"
    echo "Example: $0 ubuntu@your_server_ip ./new_cert.crt /etc/ssl/private/your_key.key"
    exit 1
fi

echo "Checking certificate-key match on $SERVER..."

# Copy the local certificate to the remote server temporarily
echo "Copying local certificate to temporary location on $SERVER..."
if ! ssh "$SERVER" "sudo tee $TEMP_REMOTE_CERT > /dev/null" < "$LOCAL_CERT_PATH"; then
    echo "Error: Failed to copy certificate to $SERVER."
    exit 1
fi
echo "Certificate copied to $TEMP_REMOTE_CERT on $SERVER."

# Extract modulus from the temporary certificate on the remote server
echo "Extracting modulus from certificate on $SERVER..."
CERT_MODULUS=$(ssh "$SERVER" "sudo openssl x509 -in $TEMP_REMOTE_CERT -modulus -noout 2>/dev/null")
if [ $? -ne 0 ]; then
    echo "Error: Failed to extract modulus from certificate on $SERVER."
    ssh "$SERVER" "sudo rm -f $TEMP_REMOTE_CERT" # Clean up temp file
    exit 1
fi

# Extract modulus from the private key on the remote server
echo "Extracting modulus from private key on $SERVER..."
KEY_MODULUS=$(ssh "$SERVER" "sudo openssl rsa -in $REMOTE_KEY_PATH -modulus -noout 2>/dev/null")
if [ $? -ne 0 ]; then
    echo "Error: Failed to extract modulus from private key $REMOTE_KEY_PATH on $SERVER."
    ssh "$SERVER" "sudo rm -f $TEMP_REMOTE_CERT" # Clean up temp file
    exit 1
fi

# Compare the moduli
echo "Comparing moduli..."
if [ "$CERT_MODULUS" == "$KEY_MODULUS" ]; then
    echo "Result: Certificate and private key MATCH."
    MATCH=0
else
    echo "Result: Certificate and private key DO NOT MATCH."
    MATCH=1
fi

# Clean up the temporary certificate file on the remote server
echo "Cleaning up temporary certificate file on $SERVER..."
ssh "$SERVER" "sudo rm -f $TEMP_REMOTE_CERT" > /dev/null 2>&1

exit $MATCH