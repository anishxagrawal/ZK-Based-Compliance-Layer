#!/usr/bin/env node
/**
 * Builds input.json for the income_threshold circuit.
 * Creates two test cases: one passing and one failing.
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
  console.log("Building income_threshold input...\n");

  // Step 1: Initialize Poseidon hasher
  console.log("Step 1: Initializing Poseidon hasher...");
  const poseidon = await buildPoseidon();
  console.log("✓ Poseidon initialized\n");

  // Step 2: Define test parameters
  const threshold = 5000000; // $50,000 in cents
  console.log(`Step 2: Threshold: ${threshold} cents ($${threshold / 100000}K)`);

  // === PASSING CASE: Income above threshold ===
  console.log("\n=== PASSING CASE ===");
  const income_pass = 7500000; // $75,000 in cents
  console.log(`Income: ${income_pass} cents ($${income_pass / 100000}K)`);
  console.log(`Check: ${income_pass} >= ${threshold}? ${income_pass >= threshold ? "YES" : "NO"}`);

  // Generate random blinding factor (31 bytes = 248 bits, safe for BN128 field)
  const blinding_factor_pass = BigInt("0x" + crypto.randomBytes(31).toString("hex"));
  console.log(`Blinding factor: ${blinding_factor_pass.toString().substring(0, 20)}...`);

  // Compute commitment
  const commitment_pass = poseidon([BigInt(income_pass), blinding_factor_pass]);
  const commitment_pass_str = fieldToString(poseidon, commitment_pass);
  console.log(`Commitment: ${commitment_pass_str.substring(0, 20)}...`);

  // Build passing input
  const input_pass = {
    income: income_pass.toString(),
    blinding_factor: blinding_factor_pass.toString(),
    threshold: threshold.toString(),
    commitment: commitment_pass_str
  };

  // Write passing input
  fs.writeFileSync("input.json", JSON.stringify(input_pass, null, 2));
  console.log("✓ Written input.json (passing case)\n");

  // === FAILING CASE: Income below threshold ===
  console.log("=== FAILING CASE ===");
  const income_fail = 3000000; // $30,000 in cents
  console.log(`Income: ${income_fail} cents ($${income_fail / 100000}K)`);
  console.log(`Check: ${income_fail} >= ${threshold}? ${income_fail >= threshold ? "YES" : "NO"}`);

  // Generate random blinding factor for failing case
  const blinding_factor_fail = BigInt("0x" + crypto.randomBytes(31).toString("hex"));
  console.log(`Blinding factor: ${blinding_factor_fail.toString().substring(0, 20)}...`);

  // Compute commitment
  const commitment_fail = poseidon([BigInt(income_fail), blinding_factor_fail]);
  const commitment_fail_str = fieldToString(poseidon, commitment_fail);
  console.log(`Commitment: ${commitment_fail_str.substring(0, 20)}...`);

  // Build failing input
  const input_fail = {
    income: income_fail.toString(),
    blinding_factor: blinding_factor_fail.toString(),
    threshold: threshold.toString(),
    commitment: commitment_fail_str
  };

  // Write failing input
  fs.writeFileSync("input_fail.json", JSON.stringify(input_fail, null, 2));
  console.log("✓ Written input_fail.json (failing case)\n");

  // Explanation
  console.log("=== EXPLANATION ===");
  console.log("The failing case will fail at WITNESS GENERATION, not at verification.");
  console.log("Why? The circuit has a constraint: geq.out === 1");
  console.log("When income < threshold, geq.out = 0, so the constraint 0 === 1 fails.");
  console.log("This happens during witness calculation, before proof generation.");
  console.log("The circuit CANNOT generate a valid witness for invalid inputs.");
  console.log("This is a fundamental property of ZK circuits: constraints are enforced at witness time.\n");

  console.log("Summary:");
  console.log(`  Threshold: ${threshold} cents ($${threshold / 100000}K)`);
  console.log(`  Passing income: ${income_pass} cents ($${income_pass / 100000}K)`);
  console.log(`  Failing income: ${income_fail} cents ($${income_fail / 100000}K)`);
  console.log(`  Passing commitment: ${commitment_pass_str}`);
  console.log(`  Failing commitment: ${commitment_fail_str}`);
  console.log("\n✓ Input generation complete!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
