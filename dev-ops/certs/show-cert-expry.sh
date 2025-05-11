#!/bin/bash

# Check if a domain is provided as an argument
if [ $# -eq 0 ]; then
    echo "Please provide a domain name as an argument."
    return
fi

DOMAIN=$1

# Get the certificate expiration date
EXPIRATION_DATE=$(echo | openssl s_client -servername $DOMAIN -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)

# Display the result
echo "SSL certificate for $DOMAIN expires on: $EXPIRATION_DATE"
