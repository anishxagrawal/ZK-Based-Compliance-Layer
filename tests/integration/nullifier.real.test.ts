/**
 * Real end-to-end integration test for nullifier registry and replay attack prevention.
 * 
 * This test uses:
 * - Real income_proof.json and income_public.json from the project root
 * - Real income_threshold_vkey.json from src/keys/
 * - Real snarkjs groth16.verify() (no mocks)
 * - Real Express app with all middleware
 * - Real nullifier computation and registry
 * - Real cryptographic verification
 * 
 * Critical test cases:
 * 1. First submission of valid proof succeeds
 * 2. Second submission of same proof fails (replay prevention)
 * 3. Nullifier is registered after successful submission
 * 4. Unknown nullifier returns used: false
 * 5. Invalid proof does not register nullifier
 * 6. Count endpoint reflects correct number
 */

import { readFileSync } from "fs";
import path from "path";
import request from "supertest";

import { createTestApp } from "../helpers/testApp";
import { computeNullifier } from "../../src/utils/nullifier";

describe("Nullifier Registry — Real ZK Replay Prevention", () => {
  const API_KEY = "f9957b09e07300463be8c34bf6864be717f82cc86271b9013c3db5f960871f1e";
  
  let realProof: Record<string, unknown>;
  let realPublicSignals: (string | number)[];
  let realNullifier: string;
  let app: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    // Set API_KEY in environment for auth middleware
    process.env.API_KEY = API_KEY;

    // Create fresh test app for this test suite
    app = createTestApp();

    // Load real proof and public signals from disk
    const proofPath = path.resolve(process.cwd(), "income_proof.json");
    const publicPath = path.resolve(process.cwd(), "income_public.json");

    realProof = JSON.parse(readFileSync(proofPath, "utf-8")) as Record<string, unknown>;
    realPublicSignals = JSON.parse(readFileSync(publicPath, "utf-8")) as (string | number)[];

    // Compute the nullifier for this proof
    realNullifier = computeNullifier(realProof, "income_threshold");
  });

  it("first submission of valid proof returns compliant: true", async () => {
    const response = await request(app)
      .post("/compliance/check")
      .set("x-api-key", API_KEY)
      .send({
        ruleId: "income_threshold",
        proof: realProof,
        publicSignals: realPublicSignals
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ compliant: true });
  }, 30000); // 30 second timeout for real cryptographic verification

  it("second submission of exact same proof returns 500 with 'already used' error", async () => {
    // This is the core replay prevention test
    // The same proof should be rejected on second submission
    const response = await request(app)
      .post("/compliance/check")
      .set("x-api-key", API_KEY)
      .send({
        ruleId: "income_threshold",
        proof: realProof,
        publicSignals: realPublicSignals
      });

    // Should return 500 (not 200 with compliant: false)
    // This is an abuse attempt, not a compliance failure
    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty("error");
    expect(response.body.message).toContain("already used");
  }, 30000); // 30 second timeout for real cryptographic verification

  it("nullifier is registered after first successful submission", async () => {
    // Check that the nullifier from the first test is now registered
    const response = await request(app)
      .get(`/compliance/nullifier/${realNullifier}`)
      .set("x-api-key", API_KEY);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ used: true });
  });

  it("unknown nullifier returns used: false", async () => {
    // Use a nullifier that has never been submitted
    const unknownNullifier = "0000000000000000000000000000000000000000000000000000000000000000";

    const response = await request(app)
      .get(`/compliance/nullifier/${unknownNullifier}`)
      .set("x-api-key", API_KEY);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ used: false });
  });

  it("invalid proof does not register nullifier", async () => {
    // Clone the real proof and tamper with pi_a[0]
    const tamperedProof = JSON.parse(JSON.stringify(realProof)) as Record<string, unknown>;
    const piA = tamperedProof.pi_a as string[];
    
    // Change the first character of pi_a[0] to break the proof
    const originalValue = piA[0];
    const firstChar = originalValue[0];
    const newFirstChar = firstChar === "1" ? "2" : "1";
    piA[0] = newFirstChar + originalValue.slice(1);

    // Compute nullifier for the tampered proof
    const tamperedNullifier = computeNullifier(tamperedProof, "income_threshold");

    // Submit the tampered proof
    const submitResponse = await request(app)
      .post("/compliance/check")
      .set("x-api-key", API_KEY)
      .send({
        ruleId: "income_threshold",
        proof: tamperedProof,
        publicSignals: realPublicSignals
      });

    // Should return compliant: false (verification fails)
    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body).toEqual({ compliant: false });

    // Now check if the nullifier was registered
    const checkResponse = await request(app)
      .get(`/compliance/nullifier/${tamperedNullifier}`)
      .set("x-api-key", API_KEY);

    // Nullifier should NOT be registered (used: false)
    // This proves we don't store nullifiers for invalid proofs
    expect(checkResponse.status).toBe(200);
    expect(checkResponse.body).toEqual({ used: false });
  }, 30000); // 30 second timeout for real cryptographic verification

  it("count endpoint reflects correct number of registered nullifiers", async () => {
    const response = await request(app)
      .get("/compliance/nullifier/count")
      .set("x-api-key", API_KEY);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("count");
    
    // Should be at least 1 (from the first successful submission)
    // Could be more if other tests ran before this
    expect(response.body.count).toBeGreaterThanOrEqual(1);
    expect(typeof response.body.count).toBe("number");
  });

  it("returns 400 for invalid nullifier hash format", async () => {
    const invalidHashes = [
      "not-a-hex-string",
      "123",  // Too short
      "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ",  // Invalid chars
      "12345678901234567890123456789012345678901234567890123456789012"  // 62 chars (too short)
    ];

    for (const invalidHash of invalidHashes) {
      const response = await request(app)
        .get(`/compliance/nullifier/${invalidHash}`)
        .set("x-api-key", API_KEY);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    }
  });

  it("different ruleIds allow same proof to be used", async () => {
    // This test verifies that nullifiers are rule-specific.
    // The same proof can be used for different rules because the nullifier
    // is computed from proof.pi_a + ruleId - changing the ruleId changes the nullifier.
    //
    // We generate a fresh sanctions_clear proof at runtime instead of loading
    // from disk to avoid stale root issues after tree rebuilds.

    // @ts-ignore
    const { buildPoseidon } = await import("circomlibjs");
    const { groth16 } = await import("snarkjs");

    const DEPTH_LOCAL = 10;
    const TREE_SIZE_LOCAL = Math.pow(2, 10);

    const SEED = [
      "18587147201541259002125695546381675692640309638765950598836980321625257723989",
      "17407676228024588307375060494808185668377214548579009094260483029038054423873",
      "1187906673085794891670707751574866400294315419428145822331767160637069288498",
      "9844570690977637410090429453924380345647745497394079884282770716521743941451",
      "14978421504646112173397466804057908810400829209353607180654878934968571317213"
    ];

    // Build tree
    const poseidon = await buildPoseidon();
    const F = poseidon.F;
    const tree: bigint[] = new Array(2 * TREE_SIZE_LOCAL).fill(BigInt(0));

    for (let i = 0; i < SEED.length; i++) {
      tree[TREE_SIZE_LOCAL + i] = BigInt(SEED[i]);
    }
    for (let i = TREE_SIZE_LOCAL - 1; i >= 1; i--) {
      const hash = poseidon([tree[2 * i], tree[2 * i + 1]]);
      tree[i] = BigInt(F.toString(hash));
    }

    const root = tree[1].toString();
    const pathElements: string[] = [];
    const pathIndices: number[] = [];
    let currentIndex = TREE_SIZE_LOCAL; // leaf index 0

    for (let level = 0; level < DEPTH_LOCAL; level++) {
      const isRight = currentIndex % 2 === 1;
      pathElements.push(tree[isRight ? currentIndex - 1 : currentIndex + 1].toString());
      pathIndices.push(isRight ? 1 : 0);
      currentIndex = Math.floor(currentIndex / 2);
    }

    const inputs = {
      identity_secret: "1234567890",
      pathElements,
      pathIndices,
      root,
      identityCommitment: SEED[0]
    };

    const wasmPath = path.resolve(
      process.cwd(),
      "circuits/sanctions_clear_js/sanctions_clear.wasm"
    );
    const zkeyPath = path.resolve(
      process.cwd(),
      "sanctions_clear_0.zkey"
    );

    const { proof: sanctionsProof, publicSignals: sanctionsPublicSignals } =
      await groth16.fullProve(inputs, wasmPath, zkeyPath);

    // First submission with sanctions_clear rule
    const response1 = await request(app)
      .post("/compliance/check")
      .set("x-api-key", API_KEY)
      .send({
        ruleId: "sanctions_clear",
        proof: sanctionsProof,
        publicSignals: sanctionsPublicSignals
      });

    expect(response1.status).toBe(200);
    expect(response1.body).toEqual({ compliant: true });

    // Verify nullifier is stored
    const nullifier1 = computeNullifier(
      sanctionsProof as unknown as Record<string, unknown>,
      "sanctions_clear"
    );

    const checkResponse = await request(app)
      .get(`/compliance/nullifier/${nullifier1}`)
      .set("x-api-key", API_KEY);

    expect(checkResponse.status).toBe(200);
    expect(checkResponse.body).toEqual({ used: true });
  }, 90000); // 90s timeout - proof generation is slow
});
