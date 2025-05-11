#!/usr/bin/env bash

curl --insecure -vvI https://roadmappartners.net 2>&1 | awk 'BEGIN { cert=0 } /^\* Server certificate:/ { cert=1 } /^\*/ { if (cert) print }'