/**
 * Express application composition root that wires middleware, routes, and dependencies.
 */

import dotenv from "dotenv";
import express from "express";
import { readFileSync } from "fs";
import Redis from "ioredis";
import path from "path";
// @ts-ignore - js-yaml doesn't have type definitions in this project
import yaml from "js-yaml";

import { ComplianceService } from "../services/ComplianceService";
import { MerkleTreeService } from "../services/MerkleTreeService";
import { ProofGenerationService } from "../services/ProofGenerationService";
// import { InMemoryNullifierRegistry } from "../zk/implementations/InMemoryNullifierRegistry";
import { RedisNullifierRegistry } from "../zk/implementations/RedisNullifierRegistry";
import { SnarkjsGenerator } from "../zk/implementations/SnarkjsGenerator";
import { SnarkjsVerifier } from "../zk/implementations/SnarkjsVerifier";
import { authMiddleware } from "./middleware/auth";
import { apiRateLimiter } from "./middleware/rateLimiter";
import { createComplianceRouter } from "./routes/compliance";
import { createProofGenerateRouter } from "./routes/proofGenerate";
import { createSanctionsRouter } from "./routes/sanctions";
import { createVerifyRouter } from "./routes/verify";

dotenv.config();

// Redis configuration
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError(err) {
    const targetErrors = ['READONLY', 'ECONNREFUSED', 'ETIMEDOUT'];
    return targetErrors.some(targetError => err.message.includes(targetError));
  }
});

// Redis event handlers
redis.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[REDIS] Connection error:', err.message);
});

redis.on('connect', () => {
  // eslint-disable-next-line no-console
  console.log('[REDIS] Connected to Redis');
});

redis.on('ready', () => {
  // eslint-disable-next-line no-console
  console.log('[REDIS] Redis client ready');
});

redis.on('reconnecting', () => {
  // eslint-disable-next-line no-console
  console.log('[REDIS] Reconnecting to Redis...');
});

const verifier = new SnarkjsVerifier();
const generator = new SnarkjsGenerator();

const nullifierRegistry = new RedisNullifierRegistry(redis);
const complianceService = new ComplianceService(verifier, nullifierRegistry);
const proofGenerationService = new ProofGenerationService(generator);

// Initialize Merkle tree for sanctions_clear circuit
const merkleTreeService = new MerkleTreeService(redis);
merkleTreeService.initialize().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[MerkleTree] Failed to initialize:", err);
  process.exit(1);
});

export const app = express();
app.use(express.json());

// Serve circuit WASM files
app.use(
  "/circuits",
  express.static(path.resolve(process.cwd(), "circuits"), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".wasm")) {
        res.setHeader("Content-Type", "application/wasm");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    }
  })
);

// Serve zkey files from project root
app.use(
  "/zkeys",
  express.static(path.resolve(process.cwd()), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".zkey")) {
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    }
  })
);

// Serve browser client assets
app.use(express.static(path.resolve(process.cwd(), "public")));

app.use(apiRateLimiter);
app.use(authMiddleware);

app.use("/verify", createVerifyRouter(verifier));
app.use("/compliance", createComplianceRouter(complianceService, nullifierRegistry));
if (process.env.NODE_ENV === "development") {
  app.use("/proof/generate", createProofGenerateRouter(proofGenerationService));
  console.log("[DEV] /proof/generate mounted — development only");
}
app.use("/sanctions", createSanctionsRouter(merkleTreeService));

app.get("/health", async (_req, res) => {
  // Check Redis connectivity using duck typing
  let redisStatus: "connected" | "disconnected" = "disconnected";
  
  if (typeof (nullifierRegistry as any).ping === 'function') {
    try {
      const isConnected = await (nullifierRegistry as any).ping();
      redisStatus = isConnected ? "connected" : "disconnected";
    } catch {
      redisStatus = "disconnected";
    }
  }
  
  const status = redisStatus === "connected" ? "ok" : "degraded";
  
  res.status(200).json({
    status,
    redis: redisStatus,
    timestamp: new Date().toISOString()
  });
});

app.get("/docs", (_req, res) => {
  try {
    const openapiPath = path.resolve(__dirname, "../docs/openapi.yaml");
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

if (require.main === module) {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Compliance API listening on port ${port}`);
  });
}
