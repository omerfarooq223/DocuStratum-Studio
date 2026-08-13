#!/usr/bin/env bash
set -e

echo "=== WebRAG Studio Automated Quality Gate ==="
echo ""

# Determine Python environment
if [ -d ".venv" ]; then
  PYTHON=".venv/bin/python3"
  PYTEST=".venv/bin/pytest"
else
  PYTHON="python3"
  PYTEST="pytest"
fi

echo "[1/2] Running Python Backend Service Tests..."
PYTHONPATH=. $PYTEST service/tests -v

echo "[2/2] Running DOM Capture Tests & Extension Build..."
if [ -d "extension/node_modules" ]; then
  cd extension
  npm test
  npm run build
  cd ..
else
  echo "Node modules not found in extension/. Installing dependencies..."
  cd extension
  npm install
  npm test
  npm run build
  cd ..
fi

echo ""
echo "=== ALL QUALITY CHECKS PASSED SUCCESSFULLY ==="
