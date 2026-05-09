/**
 * Real end-to-end integration test for POST /compliance/check endpoint with sanctions_clear rule.
 * 
 * This test uses:
 * - Real sanctions_proof.json and sanctions_public.json from the project root
 * - Real sanctions_clear_vkey.json from src/keys/
 * - Real snarkjs groth16.verify() (no mocks)
 * - Real Express app with all middleware
 * - Real cryptographic verification
 * 
 * Critical test cases:
 * 1. Valid proof → compliant: true
 * 2. Tampered proof → compliant: false (proves cryptographic guarantee)
 * 3. Unknown ruleId → 500 error (proves service validation)
 * 4. Invalid request shape → 400 error (proves Zod validation)
 */

import { readFileSync } from "fs";
import path from "path";
import request from "supertest";

import { testApp } from "../helpers/testApp";

describe("POST /compliance/check — sanctions_clear real ZK verification", () => {
  const API_KEY = "f9957b09e07300463be8c34bf6864be717f82cc86271b9013c3db5f960871f1e";
  
  let realProof: Record<string, unknown>;
  let realPublicSignals: (string | number)[];

  beforeAll(() => {
    // Set API_KEY in environment for auth middleware
    process.env.API_KEY = API_KEY;

    // Load real proof and public signals from disk
    const proofPath = path.resolve(process.cwd(), "sanctions_proof.json");
    const publicPath = path.resolve(process.cwd(), "sanctions_public.json");

    realProof = JSON.parse(readFileSync(proofPath, "utf-8")) as Record<string, unknown>;
    realPublicSignals = JSON.parse(readFileSync(publicPath, "utf-8")) as (string | number)[];
  });

  it("verifies a real valid sanctions_clear proof using actual snarkjs", async () => {
    const response = await request(testApp)
      .post("/compliance/check")
      .set("x-api-key", API_KEY)
      .send({
        ruleId: "sanctions_clear",
        proof: realProof,
        publicSignals: realPublicSignals
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ compliant: true });
  }, 30000); // 30 second timeout for real cryptographic verification

  it("rejects a tampered proof (cryptographic guarantee)", async () => {
    // Clone the real proof and tamper with pi_a[0]
    const tamperedProof = JSON.parse(JSON.stringify(realProof)) as Record<string, unknown>;
    const piA = tamperedProof.pi_a as string[];
    
    // Change the first character of pi_a[0] to break the proof
    const originalValue = piA[0];
    const firstChar = originalValue[0];
    const newFirstChar = firstChar === "1" ? "2" : "1";
    piA[0] = newFirstChar + originalValue.slice(1);

    const response = await request(testApp)
      .post("/compliance/check")
      .set("x-api-key", API_KEY)
      .send({
        ruleId: "sanctions_clear",
        proof: tamperedProof,
        publicSignals: realPublicSignals
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ compliant: false });
  }, 30000); // 30 second timeout for real cryptographic verification

  it("returns 500 for unknown ruleId", async () => {
    const response = await request(testApp)
      .post("/compliance/check")
      .set("x-api-key", API_KEY)
      .send({
        ruleId: "nonexistent_rule",
        proof: realProof,
        publicSignals: realPublicSignals
      });

    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty("error");
  });

  it("returns 400 for missing fields", async () => {
    const response = await request(testApp)
      .post("/compliance/check")
      .set("x-api-key", API_KEY)
      .send({ ruleId: "sanctions_clear" });

    expect(response.status).toBe(400);
  });
});
