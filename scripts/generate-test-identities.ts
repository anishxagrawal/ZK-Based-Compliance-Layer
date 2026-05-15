/**
 * One-time script to generate test identity commitments for the sanctions whitelist.
 * Run with: npx ts-node scripts/generate-test-identities.ts
 */
import { buildPoseidon } from "circomlibjs";

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const secrets = [
    BigInt("1234567890"),
    BigInt("9876543210"),
    BigInt("1111111111"),
    BigInt("2222222222"),
    BigInt("3333333333")
  ];

  console.log("=== TEST IDENTITIES ===\n");
  console.log("Copy the commitments array into MerkleTreeService.ts");
  console.log("Use any secret in the browser sanctions-clear.html page\n");

  const commitments: string[] = [];

  for (let i = 0; i < secrets.length; i++) {
    const hash = poseidon([secrets[i]]);
    const commitment = F.toString(hash);
    commitments.push(commitment);
    console.log(`Identity ${i + 1}:`);
    console.log(`  secret:     ${secrets[i].toString()}`);
    console.log(`  commitment: ${commitment}`);
    console.log("");
  }

  console.log("=== COMMITMENTS ARRAY (paste into MerkleTreeService.ts) ===");
  console.log(JSON.stringify(commitments, null, 2));
}

main().catch(console.error);
