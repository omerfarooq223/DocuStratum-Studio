#!/usr/bin/env bash
set -e

echo "=== WebRAG Studio Day 1 Automated Quality Gate ==="
echo ""

# Determine Python environment
if [ -d ".venv" ]; then
  PYTHON=".venv/bin/python3"
  PYTEST=".venv/bin/pytest"
else
  PYTHON="python3"
  PYTEST="pytest"
fi

echo "[1/3] Running Python Backend Service Tests..."
PYTHONPATH=. $PYTEST service/tests -v

echo "[2/3] Checking Node.js Dependencies & Extension Build..."
if [ -d "extension/node_modules" ]; then
  cd extension
  npm run build
  cd ..
else
  echo "Node modules not found in extension/. Installing dependencies..."
  cd extension
  npm install
  npm run build
  cd ..
fi

echo ""
echo "=== ALL DAY 1 QUALITY CHECKS PASSED SUCCESSFULLY ==="
