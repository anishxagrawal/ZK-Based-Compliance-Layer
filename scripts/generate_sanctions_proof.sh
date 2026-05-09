#!/usr/bin/env bash
# Generates a sample proof and public signals for the sanctions_clear circuit.

set -euo pipefail

echo "=== Sanctions Clear Proof Generation ==="
echo ""

echo "Step 1: Building circuit input..."
node scripts/build_sanctions_input.js
echo ""

echo "Step 2: Generating witness..."
node circuits/sanctions_clear_js/generate_witness.js circuits/sanctions_clear_js/sanctions_clear.wasm input.json witness.wtns
echo ""

echo "Step 3: Generating proof..."
npx snarkjs groth16 prove sanctions_clear_0.zkey witness.wtns sanctions_proof.json sanctions_public.json
echo ""

echo "Step 4: Verifying proof..."
npx snarkjs groth16 verify src/keys/sanctions_clear_vkey.json sanctions_public.json sanctions_proof.json
echo ""

echo "✓ Generated sanctions_proof.json and sanctions_public.json"
