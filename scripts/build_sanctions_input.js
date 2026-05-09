#!/usr/bin/env node
/**
 * Builds input.json for the sanctions_clear circuit.
 * Creates a Merkle tree with the identity commitment at leaf 0.
 */

const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");

// Helper to convert field element to string
function fieldToString(poseidon, value) {
  const F = poseidon.F;
  return F.toString(value);
}

async function main() {
  console.log("Building sanctions_clear input...\n");

  // Step 1: Initialize Poseidon hasher
  console.log("Step 1: Initializing Poseidon hasher...");
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  console.log("✓ Poseidon initialized\n");

  // Step 2: Define identity secret (hardcoded large random number)
  const identity_secret = "12345678901234567890123456789012345678901234567890";
  console.log(`Step 2: Identity secret: ${identity_secret}`);

  // Step 3: Compute identity commitment
  const identityCommitment = poseidon([BigInt(identity_secret)]);
  const identityCommitmentStr = fieldToString(poseidon, identityCommitment);
  console.log(`Step 3: Identity commitment: ${identityCommitmentStr}\n`);

  // Step 4: Build Merkle tree with 1024 leaves (depth 10)
  const levels = 10;
  const numLeaves = 2 ** levels; // 1024
  console.log(`Step 4: Building Merkle tree with ${numLeaves} leaves (depth ${levels})...`);

  // Initialize leaves - all zeros except leaf 0
  const leaves = new Array(numLeaves).fill(F.zero);
  leaves[0] = identityCommitment; // Place our identity at leaf 0
  console.log(`✓ Placed identity commitment at leaf 0`);

  // Build the tree level by level
  let currentLevel = leaves;
  const tree = [currentLevel];

  for (let level = 0; level < levels; level++) {
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = currentLevel[i + 1];
      const parent = poseidon([left, right]);
      nextLevel.push(parent);
    }
    tree.push(nextLevel);
    currentLevel = nextLevel;
  }

  const root = tree[levels][0];
  const rootStr = fieldToString(poseidon, root);
  console.log(`✓ Merkle root computed: ${rootStr}\n`);

  // Step 5: Generate Merkle proof for leaf 0
  console.log("Step 5: Generating Merkle proof for leaf 0...");
  const leafIndex = 0;
  const pathElements = [];
  const pathIndices = [];

  let index = leafIndex;
  for (let level = 0; level < levels; level++) {
    const isLeft = index % 2 === 0;
    const siblingIndex = isLeft ? index + 1 : index - 1;
    const sibling = tree[level][siblingIndex];

    pathElements.push(fieldToString(poseidon, sibling));
    pathIndices.push(isLeft ? 0 : 1);

    index = Math.floor(index / 2);
  }

  console.log(`✓ Path elements (${pathElements.length} siblings):`);
  pathElements.forEach((elem, i) => {
    console.log(`  Level ${i}: ${elem.substring(0, 20)}...`);
  });
  console.log(`✓ Path indices: [${pathIndices.join(", ")}]\n`);

  // Step 6: Build circuit input
  const input = {
    identity_secret: identity_secret,
    pathElements: pathElements,
    pathIndices: pathIndices,
    root: rootStr,
    identityCommitment: identityCommitmentStr
  };

  // Step 7: Write to file
  fs.writeFileSync("input.json", JSON.stringify(input, null, 2));
  console.log("Step 6: Written input.json\n");

  console.log("Summary:");
  console.log(`  Identity secret: ${identity_secret}`);
  console.log(`  Identity commitment: ${identityCommitmentStr}`);
  console.log(`  Merkle root: ${rootStr}`);
  console.log(`  Tree depth: ${levels}`);
  console.log(`  Leaf index: ${leafIndex}`);
  console.log("\n✓ Input generation complete!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
