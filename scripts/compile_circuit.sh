#!/usr/bin/env bash
# Compiles the age-check circuit and runs a dev-only Groth16 trusted setup flow.

set -euo pipefail

# === age_check circuit ===

mkdir -p circuits/age_check_js

echo "Compiling age_check circuit..."
npx circom2 circuits/age_check.circom --r1cs --wasm --sym -o circuits/

echo "Running Groth16 setup for age_check..."
npx snarkjs powersoftau new bn128 12 pot12_0.ptau -v
npx snarkjs powersoftau prepare phase2 pot12_0.ptau pot12_final.ptau
npx snarkjs groth16 setup circuits/age_check.r1cs pot12_final.ptau age_check_0.zkey

mkdir -p src/keys
npx snarkjs zkey export verificationkey age_check_0.zkey src/keys/verification_key.json

echo "age_check circuit compilation and setup complete."
echo ""

# === sanctions_clear circuit ===

mkdir -p circuits/sanctions_clear_js

echo "Compiling sanctions_clear circuit..."
npx circom2 circuits/sanctions_clear.circom --r1cs --wasm --sym -o circuits/

echo "Running Groth16 setup for sanctions_clear..."
# sanctions_clear has 5645 constraints, requires pot13 (2^13 = 8192 constraints)
# pot12 only supports 2^12 = 4096 constraints, so we generate pot13
npx snarkjs powersoftau new bn128 13 pot13_0.ptau -v
npx snarkjs powersoftau prepare phase2 pot13_0.ptau pot13_final.ptau
npx snarkjs groth16 setup circuits/sanctions_clear.r1cs pot13_final.ptau sanctions_clear_0.zkey

npx snarkjs zkey export verificationkey sanctions_clear_0.zkey src/keys/sanctions_clear_vkey.json

echo "sanctions_clear circuit compilation and setup complete."
echo ""

echo "All circuits compiled successfully."
