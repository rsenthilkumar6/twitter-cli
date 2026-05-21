#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
if [ -z "$(command -v python3)" ]; then
  echo "python3 not found" >&2
  exit 1
fi
python3 -m http.server 8000
