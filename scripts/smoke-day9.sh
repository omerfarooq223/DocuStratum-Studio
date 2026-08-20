#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../extension"

for run in 1 2 3; do
  echo "[Day 9 smoke $run/3] restore -> review -> chunks -> retrieval -> export"
  npm test -- --run src/sidepanel/__tests__/day-9-golden-path.test.tsx
done

echo "Day 9 golden-path smoke test passed three consecutive times."
