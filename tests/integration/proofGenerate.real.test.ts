/**
 * Real end-to-end integration test for POST /proof/generate endpoint.
 * 
 * This test uses:
 * - Real circuit files (wasm, zkey) from the project
 * - Real snarkjs groth16.fullProve() (no mocks)
 * - Real Express app with all middleware
 * - Real cryptographic proof generation
 * 
 * Critical test cases:
 * 1. Valid inputs → generates valid proof
 * 2. Invalid inputs (constraint violation) → witness generation fails
 * 3. Unknown ruleId → 400 error
 * 4. Invalid request shape → 400 error
 * 5. Rate limiting → 429 after 10 requests
 */

// @ts-ignore - circomlibjs doesn't have type definitions
import { buildPoseidon } from "circomlibjs";
import crypto from "crypto";
import request from "supertest";

import { testApp } from "../helpers/testApp";

describe("POST /proof/generate — real ZK proof generation", () => {
  const API_KEY = "f9957b09e07300463be8c34bf6864be717f82cc86271b9013c3db5f960871f1e";
  
  beforeAll(() => {
    // Set API_KEY in environment for auth middleware
    process.env.API_KEY = API_KEY;
  });

  it("generates a real valid proof for income_threshold", async () => {
    // Build real private inputs using Poseidon hash
    const poseidon = await buildPoseidon();
    const income = 7500000; // $75,000 in cents
    const threshold = 5000000; // $50,000 in cents
    const blinding_factor = BigInt("0x" + crypto.randomBytes(31).toString("hex"));
    
    // Compute commitment
    const commitment = poseidon([BigInt(income), blinding_factor]);
    const F = poseidon.F;
    const commitment_str = F.toString(commitment);

    const privateInputs = {
      income: income.toString(),
      blinding_factor: blinding_factor.toString(),
      threshold: threshold.toString(),
      commitment: commitment_str
    };

    const response = await request(testApp)
      .post("/proof/generate")
      .set("x-api-key", API_KEY)
      .send({
        ruleId: "income_threshold",
        privateInputs
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("proof");
    expect(response.body).toHaveProperty("publicSignals");
    
    // Verify proof structure
    expect(response.body.proof).toHaveProperty("pi_a");
    expect(response.body.proof).toHaveProperty("pi_b");
    expect(response.body.proof).toHaveProperty("pi_c");
    expect(response.body.proof).toHaveProperty("protocol", "groth16");
    expect(response.body.proof).toHaveProperty("curve", "bn128");
    
    // Verify public signals
    expect(response.body.publicSignals).toHaveLength(2);
    expect(response.body.publicSignals[0]).toBe(threshold.toString());
    expect(response.body.publicSignals[1]).toBe(commitment_str);
    
    // Verify privateInputs are NOT in response
    const responseStr = JSON.stringify(response.body);
    expect(responseStr).not.toContain(blinding_factor.toString());
    expect(responseStr).not.toContain(income.toString());
  }, 60000); // 60 second timeout for real proof generation

  it("fails witness generation for invalid inputs (income below threshold)", async () => {
    // Build inputs where income < threshold (constraint violation)
    const poseidon = await buildPoseidon();
    const income = 3000000; // $30,000 in cents (BELOW threshold)
    const threshold = 5000000; // $50,000 in cents
    const blinding_factor = BigInt("0x" + crypto.randomBytes(31).toString("hex"));
    
    // Compute commitment
    const commitment = poseidon([BigInt(income), blinding_factor]);
    const F = poseidon.F;
    const commitment_str = F.toString(commitment);

    const privateInputs = {
      income: income.toString(),
      blinding_factor: blinding_factor.toString(),
      threshold: threshold.toString(),
      commitment: commitment_str
    };

    const response = await request(testApp)
      .post("/proof/generate")
      .set("x-api-key", API_KEY)
      .send({
        ruleId: "income_threshold",
        privateInputs
      });

    // Expect 500 because witness generation will fail
    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty("error");
    expect(response.body.error).toBe("Proof generation failed.");
  }, 60000); // 60 second timeout

  it("generates a real valid proof for sanctions_clear", async () => {
    // Build real private inputs for sanctions_clear circuit
    const poseidon = await buildPoseidon();
    const identity_secret = "12345678901234567890123456789012345678901234567890";
    
    // Compute identity commitment
    const identityCommitment = poseidon([BigInt(identity_secret)]);
    const F = poseidon.F;
    const identityCommitment_str = F.toString(identityCommitment);
    
    // Build Merkle tree with identity at leaf 0
    const tree_depth = 10;
    let current = identityCommitment;
    const pathElements = [];
    const pathIndices = [];
    
    for (let i = 0; i < tree_depth; i++) {
      const sibling = poseidon([BigInt(0)]); // Zero sibling
      pathElements.push(F.toString(sibling));
      pathIndices.push(0);
      current = poseidon([current, sibling]);
    }
    
    const root = F.toString(current);

    const privateInputs = {
      identity_secret,
      pathElements,
      pathIndices,
      root,
      identityCommitment: identityCommitment_str
    };

    const response = await request(testApp)
      .post("/proof/generate")
      .set("x-api-key", API_KEY)
      .send({
        ruleId: "sanctions_clear",
        privateInputs
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("proof");
    expect(response.body).toHaveProperty("publicSignals");
    
    // Verify proof structure
    expect(response.body.proof).toHaveProperty("pi_a");
    expect(response.body.proof).toHaveProperty("pi_b");
    expect(response.body.proof).toHaveProperty("pi_c");
    
    // Verify public signals (root and identityCommitment)
    expect(response.body.publicSignals).toHaveLength(2);
    expect(response.body.publicSignals[0]).toBe(root);
    expect(response.body.publicSignals[1]).toBe(identityCommitment_str);
    
    // Verify privateInputs are NOT in response
    const responseStr = JSON.stringify(response.body);
    expect(responseStr).not.toContain(identity_secret);
  }, 60000); // 60 second timeout

  it("returns 400 for unknown ruleId", async () => {
    const response = await request(testApp)
      .post("/proof/generate")
      .set("x-api-key", API_KEY)
      .send({
        ruleId: "nonexistent",
        privateInputs: { test: "data" }
      });

    // Zod validation catches invalid ruleId before service layer
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
    expect(response.body.error).toBe("Invalid request body.");
  });

  it("returns 400 for invalid request shape", async () => {
    const response = await request(testApp)
      .post("/proof/generate")
      .set("x-api-key", API_KEY)
      .send({ invalid: true });

    expect(response.status).toBe(400);
  });

  it("returns 401 without valid API key", async () => {
    const response = await request(testApp)
      .post("/proof/generate")
      .set("x-api-key", "wrong-key")
      .send({
        ruleId: "income_threshold",
        privateInputs: { test: "data" }
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("error");
  });

  it("enforces rate limiting (10 requests per minute)", async () => {
    // Build minimal valid inputs
    const poseidon = await buildPoseidon();
    const income = 7500000;
    const threshold = 5000000;
    const blinding_factor = BigInt("123456");
    const commitment = poseidon([BigInt(income), blinding_factor]);
    const F = poseidon.F;

    const privateInputs = {
      income: income.toString(),
      blinding_factor: blinding_factor.toString(),
      threshold: threshold.toString(),
      commitment: F.toString(commitment)
    };

    // Make 11 requests rapidly
    const requests = [];
    for (let i = 0; i < 11; i++) {
      requests.push(
        request(testApp)
          .post("/proof/generate")
          .set("x-api-key", API_KEY)
          .send({
            ruleId: "income_threshold",
            privateInputs
          })
      );
    }

    const responses = await Promise.all(requests);

    // First 10 should succeed (200) or be processing
    // 11th should be rate limited (429)
    const statusCodes = responses.map(r => r.status);
    const rateLimitedCount = statusCodes.filter(s => s === 429).length;
    
    expect(rateLimitedCount).toBeGreaterThan(0);
  }, 120000); // 120 second timeout for multiple proof generations
});
