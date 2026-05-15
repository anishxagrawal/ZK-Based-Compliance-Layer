/**
 * Real end-to-end integration test for POST /verify endpoint.
 * 
 * This test uses:
 * - Real proof.json and public.json from the project root
 * - Real verification_key.json from src/keys/
 * - Real snarkjs groth16.verify() (no mocks)
 * - Real Express app with all middleware
 * - Real cryptographic verification
 * 
 * Critical test cases:
 * 1. Valid proof → verified: true
 * 2. Tampered proof → verified: false (proves cryptographic guarantee)
 * 3. Invalid request shape → 400 error (proves validation works)
 */

import { readFileSync } from "fs";
import path from "path";
import request from "supertest";

import { testApp } from "../helpers/testApp";

describe("POST /verify — real ZK verification", () => {
  const API_KEY = "f9957b09e07300463be8c34bf6864be717f82cc86271b9013c3db5f960871f1e";
  
  let realProof: Record<string, unknown>;
  let realPublicSignals: (string | number)[];

  beforeAll(() => {
    // Set API_KEY in environment for auth middleware
    process.env.API_KEY = API_KEY;

    // Load real proof and public signals from disk
    const proofPath = path.resolve(process.cwd(), "proof.json");
    const publicPath = path.resolve(process.cwd(), "public.json");

    realProof = JSON.parse(readFileSync(proofPath, "utf-8")) as Record<string, unknown>;
    realPublicSignals = JSON.parse(readFileSync(publicPath, "utf-8")) as (string | number)[];
  });

  it("verifies a real valid proof using actual snarkjs", async () => {
    const response = await request(testApp)
      .post("/verify")
      .set("x-api-key", API_KEY)
      .send({
        ruleId: "age_18",
        proof: realProof,
        publicSignals: realPublicSignals
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ verified: true });
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
      .post("/verify")
      .set("x-api-key", API_KEY)
      .send({
        ruleId: "age_18",
        proof: tamperedProof,
        publicSignals: realPublicSignals
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ verified: false });
  }, 30000); // 30 second timeout for real cryptographic verification

  it("returns 400 for invalid request shape", async () => {
    const response = await request(testApp)
      .post("/verify")
      .set("x-api-key", API_KEY)
      .send({ invalid: true });

    expect(response.status).toBe(400);
  });

  it("returns 401 without valid API key", async () => {
    const response = await request(testApp)
      .post("/verify")
      .set("x-api-key", "wrong-key")
      .send({
        ruleId: "age_18",
        proof: realProof,
        publicSignals: realPublicSignals
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("error");
  });
});
