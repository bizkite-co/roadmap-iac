#!/bin/bash

DOMAIN_NAME="retirementtaxanalyzer.com"
AUTH_CODE="$RETIREMENTTAXANALYZER_DOMAIN_TRANSFER_AUTH_CODE"
DURATION_IN_YEARS=1
ADMIN_CONTACT="FirstName=Joel,LastName=Solomon,ContactType=PERSON,OrganizationName=\"PRS, LLC\",AddressLine1=\"2 Park Plaza, Suite 320\",City=Irvine,State=California,CountryCode=US,ZipCode=92614,PhoneNumber=\"+1.9495442500\",Email=joel@roadmappartners.net"
REGISTRANT_CONTACT="FirstName=Joel,LastName=Solomon,ContactType=PERSON,OrganizationName=\"PRS, LLC\",AddressLine1=\"2 Park Plaza, Suite 320\",City=Irvine,State=California,CountryCode=US,ZipCode=92614,PhoneNumber=\"+1.9495442500\",Email=joel@roadmappartners.net"
TECH_CONTACT="FirstName=Joel,LastName=Solomon,ContactType=PERSON,OrganizationName=\"PRS, LLC\",AddressLine1=\"2 Park Plaza, Suite 320\",City=Irvine,State=California,CountryCode=US,ZipCode=92614,PhoneNumber=\"+1.9495442500\",Email=joel@roadmappartners.net"

aws route53domains transfer-domain \
  --domain-name "$DOMAIN_NAME" \
  --auth-code "$AUTH_CODE" \
  --duration-in-years "$DURATION_IN_YEARS" \
  --nameservers Name=ns-1239.awsdns-26.org Name=ns-825.awsdns-39.net Name=ns-28.awsdns-03.com Name=ns-1537.awsdns-00.co.uk \
  --admin-contact "$ADMIN_CONTACT" \
  --registrant-contact "$REGISTRANT_CONTACT" \
  --tech-contact "$TECH_CONTACT" \
  --endpoint-url https://route53domains.us-west-1.amazonaws.com/