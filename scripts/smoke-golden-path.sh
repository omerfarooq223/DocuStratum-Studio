#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../extension"

for run in 1 2 3; do
  echo "[Golden path smoke $run/3] restore -> review -> chunks -> retrieval -> export"
  npm test -- --run src/sidepanel/__tests__/golden-path.test.tsx
done

echo "Golden-path smoke test passed three consecutive times."

