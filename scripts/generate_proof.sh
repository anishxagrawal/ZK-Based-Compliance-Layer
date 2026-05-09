#!/usr/bin/env bash
# Generates a sample proof and public signals for the age-check circuit.

set -euo pipefail

cat > input.json <<'EOF'
{
  "age": 21,
  "threshold": 18
}
EOF

npx snarkjs groth16 fullprove input.json circuits/age_check_js/age_check.wasm age_check_0.zkey proof.json public.json

echo "Generated proof.json and public.json"
