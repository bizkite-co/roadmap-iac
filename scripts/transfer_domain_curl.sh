#!/bin/bash

DOMAIN_NAME="retirementtaxanalyzer.com"
AUTH_CODE="$RETIREMENTTAXANALYZER_DOMAIN_TRANSFER_AUTH_CODE"
DURATION_IN_YEARS=1
NAMESERVERS="ns-1239.awsdns-26.org,ns-825.awsdns-39.net,ns-28.awsdns-03.com,ns-1537.awsdns-00.co.uk"
ADMIN_CONTACT='{"FirstName": "Joel", "LastName": "Solomon", "ContactType": "PERSON", "OrganizationName": "PRS, LLC", "AddressLine1": "2 Park Plaza, Suite 320", "City": "Irvine", "State": "California", "CountryCode": "US", "ZipCode": "92614", "PhoneNumber": "+1.9495442500", "Email": "joel@roadmappartners.net"}'
REGISTRANT_CONTACT='{"FirstName": "Joel", "LastName": "Solomon", "ContactType": "PERSON", "OrganizationName": "PRS, LLC", "AddressLine1": "2 Park Plaza, Suite 320", "City": "Irvine", "State": "California", "CountryCode": "US", "ZipCode": "92614", "PhoneNumber": "+1.9495442500", "Email": "joel@roadmappartners.net"}'
TECH_CONTACT='{"FirstName": "Joel", "LastName": "Solomon", "ContactType": "PERSON", "OrganizationName": "PRS, LLC", "AddressLine1": "2 Park Plaza, Suite 320", "City": "Irvine", "State": "California", "CountryCode": "US", "ZipCode": "92614", "PhoneNumber": "+1.9495442500", "Email": "joel@roadmappartners.net"}'

env AWS_REGION=us-east-1 curl --location --request POST 'https://route53domains.us-east-1.amazonaws.com/TransferDomain' \
--header 'Content-Type: application/json' \
--data-raw "{
    \"DomainName\": \"$DOMAIN_NAME\",
    \"AuthCode\": \"$AUTH_CODE\",
    \"DurationInYears\": $DURATION_IN_YEARS,
    \"Nameservers\": [\"$NAMESERVERS\"],
    \"AdminContact\": $ADMIN_CONTACT,
    \"RegistrantContact\": $REGISTRANT_CONTACT,
    \"TechContact\": $TECH_CONTACT
}"