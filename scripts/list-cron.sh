#!/bin/bash

aws events list-rules | jq -r '.Rules[].Name' | while read rule; do
  aws events describe-rule --name "$rule"
  aws events list-targets-by-rule --rule "$rule"
done