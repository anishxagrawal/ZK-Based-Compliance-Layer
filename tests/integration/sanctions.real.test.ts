/**
 * Real end-to-end integration test for POST /compliance/check with sanctions_clear.
 *
 * ARCHITECTURE NOTE:
 * This test generates proofs at runtime using snarkjs directly.
 * It does NOT load proof.json from disk - that approach ties tests to a specific
 * Merkle tree root which breaks every time a new identity is registered.
 *
 * The test builds its own minimal Merkle tree matching the seed commitments,
 * generates a fresh proof, and submits it. This makes the test self-contained
 * and always consistent with the current system state.
 */

import path from "path";
import request from "supertest";
// @ts-ignore
import { buildPoseidon } from "circomlibjs";
import { groth16 } from "snarkjs";

import { testApp } from "../helpers/testApp";

const API_KEY = "f9957b09e07300463be8c34bf6864be717f82cc86271b9013c3db5f960871f1e";

// Seed commitments - must match SEED_COMMITMENTS in MerkleTreeService.ts exactly
// These are Poseidon(secret) for secrets: 1234567890, 9876543210, 1111111111, 2222222222, 3333333333
const SEED_COMMITMENTS = [
  "18587147201541259002125695546381675692640309638765950598836980321625257723989",
  "17407676228024588307375060494808185668377214548579009094260483029038054423873",
  "1187906673085794891670707751574866400294315419428145822331767160637069288498",
  "9844570690977637410090429453924380345647745497394079884282770716521743941451",
  "14978421504646112173397466804057908810400829209353607180654878934968571317213"
];

// Test identity - secret 1234567890, commitment is SEED_COMMITMENTS[0]
const TEST_SECRET = "1234567890";
const TEST_COMMITMENT = SEED_COMMITMENTS[0];

const DEPTH = 10;
const TREE_SIZE = Math.pow(2, 10); // 1024

/**
 * Builds a Poseidon Merkle tree from the seed commitments.
 * Returns the root and the path for the given leaf index.
 *
 * This mirrors MerkleTreeService._buildTree() exactly so the
 * generated proof matches what the server would verify against.
 */
async function buildTestTree(poseidon: any) {
  const F = poseidon.F;

  // Build flat tree array - same structure as MerkleTreeService
  const tree: bigint[] = new Array(2 * TREE_SIZE).fill(BigInt(0));

  // Fill leaves with seed commitments
  for (let i = 0; i < SEED_COMMITMENTS.length; i++) {
    tree[TREE_SIZE + i] = BigInt(SEED_COMMITMENTS[i]);
  }

  // Build internal nodes bottom-up
  for (let i = TREE_SIZE - 1; i >= 1; i--) {
    const left = tree[2 * i];
    const right = tree[2 * i + 1];
    const hash = poseidon([left, right]);
    tree[i] = BigInt(F.toString(hash));
  }

  // Extract root
  const root = tree[1].toString();

  // Extract path for leaf index 0 (TEST_COMMITMENT is at index 0)
  const leafIndex = 0;
  const pathElements: string[] = [];
  const pathIndices: number[] = [];

  let currentIndex = TREE_SIZE + leafIndex;

  for (let level = 0; level < DEPTH; level++) {
    const isRightChild = currentIndex % 2 === 1;

    if (isRightChild) {
      pathElements.push(tree[currentIndex - 1].toString());
      pathIndices.push(1);
    } else {
      pathElements.push(tree[currentIndex + 1].toString());
      pathIndices.push(0);
    }

    currentIndex = Math.floor(currentIndex / 2);
  }

  return { root, pathElements, pathIndices };
}

describe("POST /compliance/check - sanctions_clear real ZK verification", () => {
  let proof: Record<string, unknown>;
  let publicSignals: string[];
  let poseidon: any;

  beforeAll(async () => {
    process.env.API_KEY = API_KEY;

    // Build Poseidon hasher
    poseidon = await buildPoseidon();

    // Build the test Merkle tree and get path for TEST_COMMITMENT
    const { root, pathElements, pathIndices } = await buildTestTree(poseidon);

    // Circuit inputs
    const inputs = {
      identity_secret: TEST_SECRET,
      pathElements: pathElements,
      pathIndices: pathIndices,
      root: root,
      identityCommitment: TEST_COMMITMENT
    };

    // Generate real proof using snarkjs
    const wasmPath = path.resolve(
      process.cwd(),
      "circuits/sanctions_clear_js/sanctions_clear.wasm"
    );
    const zkeyPath = path.resolve(
      process.cwd(),
      "sanctions_clear_0.zkey"
    );

    const result = await groth16.fullProve(inputs, wasmPath, zkeyPath);
    proof = result.proof as unknown as Record<string, unknown>;
    publicSignals = result.publicSignals;

    console.log("[test] Proof generated. Root:", root);
    console.log("[test] Public signals:", publicSignals);
  }, 60000); // 60s timeout for proof generation

  it("verifies a real valid sanctions_clear proof using actual snarkjs", async () => {
    const response = await request(testApp)
      .post("/compliance/check")
      .set("x-api-key", API_KEY)
      .send({
        ruleId: "sanctions_clear",
        proof,
        publicSignals
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ compliant: true });
  }, 30000);

  it("rejects a tampered proof (cryptographic guarantee)", async () => {
    const tamperedProof = JSON.parse(JSON.stringify(proof)) as Record<string, unknown>;
    const piA = tamperedProof.pi_a as string[];

    // Flip first digit of pi_a[0]
    const original = piA[0];
    const firstChar = original[0];
    const newFirstChar = firstChar === "1" ? "2" : "1";
    piA[0] = newFirstChar + original.slice(1);

    const response = await request(testApp)
      .post("/compliance/check")
      .set("x-api-key", API_KEY)
      .send({
        ruleId: "sanctions_clear",
        proof: tamperedProof,
        publicSignals
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ compliant: false });
  }, 30000);

  it("returns 500 for unknown ruleId", async () => {
    const response = await request(testApp)
      .post("/compliance/check")
      .set("x-api-key", API_KEY)
      .send({
        ruleId: "unknown_rule",
        proof,
        publicSignals
      });

    expect(response.status).toBe(500);
  }, 30000);

  it("returns 400 for invalid request shape", async () => {
    const response = await request(testApp)
      .post("/compliance/check")
      .set("x-api-key", API_KEY)
      .send({ ruleId: "sanctions_clear" });

    expect(response.status).toBe(400);
  });

  it("returns 401 without valid API key", async () => {
    const response = await request(testApp)
      .post("/compliance/check")
      .set("x-api-key", "wrong-key")
      .send({
        ruleId: "sanctions_clear",
        proof,
        publicSignals
      });

    expect(response.status).toBe(401);
  });
});
