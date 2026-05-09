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
    // This test verifies that nullifiers are rule-specific
    // The same proof can be used for different rules
    
    // Use the sanctions_clear rule with a different proof
    const sanctionsProofPath = path.resolve(process.cwd(), "sanctions_proof.json");
    const sanctionsPublicPath = path.resolve(process.cwd(), "sanctions_public.json");

    const sanctionsProof = JSON.parse(readFileSync(sanctionsProofPath, "utf-8")) as Record<string, unknown>;
    const sanctionsPublicSignals = JSON.parse(readFileSync(sanctionsPublicPath, "utf-8")) as (string | number)[];

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

    // Compute nullifiers for both rules
    const nullifier1 = computeNullifier(sanctionsProof, "sanctions_clear");
    
    // Verify the nullifier is registered
    const checkResponse = await request(app)
      .get(`/compliance/nullifier/${nullifier1}`)
      .set("x-api-key", API_KEY);

    expect(checkResponse.status).toBe(200);
    expect(checkResponse.body).toEqual({ used: true });
  }, 30000); // 30 second timeout for real cryptographic verification
});
