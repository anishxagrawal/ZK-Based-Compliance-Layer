#!/usr/bin/env bash
# Generates a sample proof and public signals for the income_threshold circuit.

set -euo pipefail

echo "=== Income Threshold Proof Generation ==="
echo ""

echo "Step 1: Building circuit input..."
node scripts/build_income_threshold_input.js
echo ""

echo "Step 2: Generating witness..."
node circuits/income_threshold_js/generate_witness.js circuits/income_threshold_js/income_threshold.wasm input.json witness.wtns
echo ""

echo "Step 3: Generating proof..."
npx snarkjs groth16 prove income_threshold_0.zkey witness.wtns income_proof.json income_public.json
echo ""

echo "Step 4: Verifying proof..."
npx snarkjs groth16 verify src/keys/income_threshold_vkey.json income_public.json income_proof.json
echo ""

echo "✓ Generated income_proof.json and income_public.json"
