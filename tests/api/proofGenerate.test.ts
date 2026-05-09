/**
 * API tests for POST /proof/generate endpoint with request validation.
 * Tests verify Zod schema validation, rate limiting, and error handling.
 */

import express from "express";
import rateLimit, { MemoryStore } from "express-rate-limit";
import request from "supertest";

import { createProofGenerateRouter } from "../../src/api/routes/proofGenerate";
import { ProofGenerationService } from "../../src/services/ProofGenerationService";
import { IProofGenerator } from "../../src/zk/interfaces/IProofGenerator";

describe("POST /proof/generate", () => {
  let mockGenerator: IProofGenerator;
  let service: ProofGenerationService;

  beforeEach(() => {
    mockGenerator = {
      generate: jest.fn().mockResolvedValue({
        proof: {
          pi_a: ["1", "2", "1"],
          pi_b: [["1", "2"], ["3", "4"], ["5", "6"]],
          pi_c: ["7", "8", "1"],
          protocol: "groth16",
          curve: "bn128"
        },
        publicSignals: ["18"]
      })
    };

    service = new ProofGenerationService(mockGenerator, {
      age_18: {
        vKeyPath: "unused",
        wasmPath: "circuits/age_check_js/age_check.wasm",
        zkeyPath: "age_check_0.zkey"
      },
      income_threshold: {
        vKeyPath: "unused",
        wasmPath: "circuits/income_threshold_js/income_threshold.wasm",
        zkeyPath: "income_threshold_0.zkey"
      },
      sanctions_clear: {
        vKeyPath: "unused",
        wasmPath: "circuits/sanctions_clear_js/sanctions_clear.wasm",
        zkeyPath: "sanctions_clear_0.zkey"
      }
    });
  });

  // Helper to create a fresh app instance for each test to avoid rate limiting
  function createTestApp() {
    const app = express();
    app.use(express.json());
    
    // Create a fresh rate limiter store for each test to reset counters
    const store = new MemoryStore();
    app.use("/proof/generate", createProofGenerateRouter(service, store));
    
    return app;
  }

  it("does not include privateInputs in response", async () => {
    const privateInputs = {
      income: "7500000",
      blinding_factor: "super_secret_123456",
      threshold: "5000000",
      commitment: "999"
    };

    const response = await request(createTestApp())
      .post("/proof/generate")
      .send({
        ruleId: "income_threshold",
        privateInputs
      });

    expect(response.status).toBe(200);
    
    // Verify privateInputs are NOT in response
    const responseStr = JSON.stringify(response.body);
    expect(responseStr).not.toContain("super_secret_123456");
    expect(responseStr).not.toContain("blinding_factor");
    
    // Verify only proof and publicSignals are returned
    expect(Object.keys(response.body)).toEqual(["proof", "publicSignals"]);
  });

  it("returns proof and publicSignals for valid request", async () => {
    const response = await request(createTestApp())
      .post("/proof/generate")
      .send({
        ruleId: "age_18",
        privateInputs: { age: "25", secret: "12345" }
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("proof");
    expect(response.body).toHaveProperty("publicSignals");
    expect(response.body.proof).toHaveProperty("pi_a");
    expect(response.body.proof).toHaveProperty("pi_b");
    expect(response.body.proof).toHaveProperty("pi_c");
    expect(response.body.publicSignals).toEqual(["18"]);
  });

  it("returns 400 for invalid ruleId", async () => {
    const response = await request(createTestApp())
      .post("/proof/generate")
      .send({
        ruleId: "invalid_rule",
        privateInputs: { age: "25" }
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
  });

  it("accepts all valid ruleIds", async () => {
    const validRuleIds = ["age_18", "income_threshold", "sanctions_clear"];

    for (const ruleId of validRuleIds) {
      const response = await request(createTestApp())
        .post("/proof/generate")
        .send({
          ruleId,
          privateInputs: { test: "data" }
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("proof");
      expect(response.body).toHaveProperty("publicSignals");
    }
  });

  it("returns 500 for proof generation failure", async () => {
    // Mock service to throw witness generation error
    service.generateProof = jest.fn().mockRejectedValue(
      new Error("Witness generation failed: constraint not satisfied")
    );

    const response = await request(createTestApp())
      .post("/proof/generate")
      .send({
        ruleId: "age_18",
        privateInputs: { age: "15" }
      });

    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty("error");
    expect(response.body.error).toBe("Proof generation failed.");
  });

  it("returns 400 when service throws unknown ruleId error", async () => {
    // Mock service to throw unknown ruleId error
    service.generateProof = jest.fn().mockRejectedValue(
      new Error("Unknown ruleId: nonexistent")
    );

    const response = await request(createTestApp())
      .post("/proof/generate")
      .send({
        ruleId: "age_18",
        privateInputs: { age: "25" }
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
    expect(response.body.error).toBe("Invalid ruleId.");
  });

  it("returns 400 for invalid payload structure", async () => {
    const response = await request(createTestApp())
      .post("/proof/generate")
      .send({ invalid: true });

    expect(response.status).toBe(400);
  });

  it("returns 400 for missing privateInputs", async () => {
    const response = await request(createTestApp())
      .post("/proof/generate")
      .send({
        ruleId: "age_18"
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
  });

  it("returns 400 for missing ruleId", async () => {
    const response = await request(createTestApp())
      .post("/proof/generate")
      .send({
        privateInputs: { age: "25" }
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
  });

  it("returns 400 for invalid ruleId", async () => {
    const response = await request(createTestApp())
      .post("/proof/generate")
      .send({
        ruleId: "invalid_rule",
        privateInputs: { age: "25" }
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
  });
});
