/**
 * Test application factory for integration tests.
 * 
 * This factory creates an Express app configured for testing with:
 * - InMemoryNullifierRegistry (no Redis required)
 * - All other production dependencies (real snarkjs, real verification)
 * - Same middleware and routes as production
 * 
 * WHY THIS EXISTS:
 * - Integration tests should not require external dependencies (Redis)
 * - Tests should be fast and reliable
 * - Production app.ts uses Redis, test app uses in-memory storage
 * - Keeps test isolation (each test can get fresh app instance)
 */

import dotenv from "dotenv";
import express from "express";
import { readFileSync } from "fs";
import path from "path";
// @ts-ignore - js-yaml doesn't have type definitions in this project
import yaml from "js-yaml";

import { ComplianceService } from "../../src/services/ComplianceService";
import { ProofGenerationService } from "../../src/services/ProofGenerationService";
import { InMemoryNullifierRegistry } from "../../src/zk/implementations/InMemoryNullifierRegistry";
import { SnarkjsGenerator } from "../../src/zk/implementations/SnarkjsGenerator";
import { SnarkjsVerifier } from "../../src/zk/implementations/SnarkjsVerifier";
import { authMiddleware } from "../../src/api/middleware/auth";
import { apiRateLimiter } from "../../src/api/middleware/rateLimiter";
import { createComplianceRouter } from "../../src/api/routes/compliance";
import { createProofGenerateRouter } from "../../src/api/routes/proofGenerate";
import { createVerifyRouter } from "../../src/api/routes/verify";

dotenv.config();

/**
 * Creates a test Express application with in-memory nullifier registry.
 * 
 * This function is called by integration tests to get a fresh app instance
 * that doesn't require Redis or any other external dependencies.
 * 
 * @returns Express application configured for testing
 */
export function createTestApp() {
  const verifier = new SnarkjsVerifier();
  const generator = new SnarkjsGenerator();

  const nullifierRegistry = new InMemoryNullifierRegistry();
  const complianceService = new ComplianceService(verifier, nullifierRegistry);
  const proofGenerationService = new ProofGenerationService(generator);

  const app = express();
  app.use(express.json());
  app.use(apiRateLimiter);
  app.use(authMiddleware);

  app.use("/verify", createVerifyRouter(verifier));
  app.use("/compliance", createComplianceRouter(complianceService, nullifierRegistry));
  app.use("/proof/generate", createProofGenerateRouter(proofGenerationService));

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get("/docs", (_req, res) => {
    try {
      const openapiPath = path.resolve(__dirname, "../../src/docs/openapi.yaml");
      const openapiContent = readFileSync(openapiPath, "utf-8");
      const openapiJson = yaml.load(openapiContent) as Record<string, unknown>;
      res.status(200).json(openapiJson);
    } catch (error) {
      res.status(500).json({
        error: "Failed to load OpenAPI specification.",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  return app;
}

/**
 * Singleton test app instance for tests that don't need isolation.
 * 
 * Most integration tests can share this instance for better performance.
 * Tests that need isolation (e.g., testing nullifier state) should call
 * createTestApp() to get a fresh instance.
 */
export const testApp = createTestApp();
