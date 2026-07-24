#!/bin/bash

set -euo pipefail

SOURCE_DIR="../roadmap-website/e2e"
DEST_DIR="lambda/e2e"

# Ensure the source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: Source directory $SOURCE_DIR does not exist." >&2
  exit 1
fi

# Create destination directory if it doesn't exist
mkdir -p "$DEST_DIR"

echo "Copying E2E tests from $SOURCE_DIR to $DEST_DIR..."
rsync -av --delete "$SOURCE_DIR/" "$DEST_DIR/"

echo "E2E tests copied successfully."
