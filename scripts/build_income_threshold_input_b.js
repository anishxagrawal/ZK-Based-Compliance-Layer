#!/usr/bin/env node
/**
 * Builds input_b.json for the income_threshold circuit.
 * This is Proof B with different parameters for cross-proof testing.
 */

const { buildPoseidon } = require("circomlibjs");
const crypto = require("crypto");
const fs = require("fs");

// Helper to convert field element to string
function fieldToString(poseidon, value) {
  const F = poseidon.F;
  return F.toString(value);
}

async function main() {
  console.log("Building income_threshold input B...\n");

  // Step 1: Initialize Poseidon hasher
  console.log("Step 1: Initializing Poseidon hasher...");
  const poseidon = await buildPoseidon();
  console.log("✓ Poseidon initialized\n");

  // Step 2: Define test parameters for Proof B
  const threshold = 3000000; // $30,000 in cents
  const income = 4000000; // $40,000 in cents
  console.log(`Step 2: Threshold: ${threshold} cents ($${threshold / 100000}K)`);
  console.log(`Income: ${income} cents ($${income / 100000}K)`);
  console.log(`Check: ${income} >= ${threshold}? ${income >= threshold ? "YES" : "NO"}`);

  // Generate random blinding factor
  const blinding_factor = BigInt("0x" + crypto.randomBytes(31).toString("hex"));
  console.log(`Blinding factor: ${blinding_factor.toString().substring(0, 20)}...`);

  // Compute commitment
  const commitment = poseidon([BigInt(income), blinding_factor]);
  const commitment_str = fieldToString(poseidon, commitment);
  console.log(`Commitment: ${commitment_str.substring(0, 20)}...`);

  // Build input
  const input = {
    income: income.toString(),
    blinding_factor: blinding_factor.toString(),
    threshold: threshold.toString(),
    commitment: commitment_str
  };

  // Write input
  fs.writeFileSync("input_b.json", JSON.stringify(input, null, 2));
  console.log("✓ Written input_b.json\n");

  console.log("Summary:");
  console.log(`  Threshold: ${threshold} cents ($${threshold / 100000}K)`);
  console.log(`  Income: ${income} cents ($${income / 100000}K)`);
  console.log(`  Commitment: ${commitment_str}`);
  console.log("\n✓ Input B generation complete!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
