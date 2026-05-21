#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
PORT=8000
echo "Serving repo at http://localhost:${PORT}/"
python3 -m http.server ${PORT}
