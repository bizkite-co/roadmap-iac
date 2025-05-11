#!/usr/bin/env bash

echo "\n### RoadmapParners.net"
curl --insecure -vvI https://roadmappartners.net 2>&1 | awk 'BEGIN { cert=0 } /^\* Server certificate:/ { cert=1 } /^\*/ { if (cert) print }'
echo "\n### RetirementTaxAnalyzer.com"
curl --insecure -vvI https://retirementtaxanalyzer.com 2>&1 | awk 'BEGIN { cert=0 } /^\* Server certificate:/ { cert=1 } /^\*/ { if (cert) print }'