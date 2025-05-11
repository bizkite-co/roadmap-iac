#!/bin/bash

# Check if the correct number of arguments is provided
if [ $# -ne 3 ]; then
  echo "Usage: ./compare_files.sh <prod_server_address> <local_file_path> <remote_file_path>"
  exit 1
fi

# Set the arguments
PROD_SERVER_ADDRESS="$1"
LOCAL_FILE_PATH="$2"
REMOTE_FILE_PATH="$3"

# Get the local file hash
LOCAL_HASH=$(sha256sum "$LOCAL_FILE_PATH" | awk '{print $1}')

# Get the remote file hash using SSH
REMOTE_HASH=$(ssh "$PROD_SERVER_ADDRESS" "sudo sha256sum $REMOTE_FILE_PATH 2>/dev/null" | awk '{print $1}')

# Compare the hashes
if [ "$LOCAL_HASH" == "$REMOTE_HASH" ]; then
  echo "Files are identical."
  exit 0
else
  echo "Files are different."
  exit 1
fi