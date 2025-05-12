#!/bin/bash

# Script to check the SSL certificate being served by a web server for a specific domain.

SERVER="$1"
DOMAIN="$2"

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <server> <domain>"
    echo "Example: $0 ubuntu@your_server_ip your_domain.com"
    exit 1
fi

echo "Checking certificate served by $SERVER for domain $DOMAIN..."

# Use openssl s_client to connect and retrieve the certificate, then pipe to openssl x509 to display details
ssh "$SERVER" "openssl s_client -connect $SERVER:443 -servername $DOMAIN < /dev/null 2>/dev/null | openssl x509 -text -noout"

if [ $? -ne 0 ]; then
    echo "Error: Failed to retrieve certificate from $SERVER for $DOMAIN."
    exit 1
fi

echo "Certificate details retrieved successfully."

exit 0