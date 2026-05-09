/**
 * Proof generation route that validates payloads and delegates generation to the service layer.
 * 
 * SECURITY NOTES:
 * - Private inputs are never logged, stored, or returned
 * - Stricter rate limiting (10 req/min/IP) due to CPU-intensive proof generation
 * - Only the cryptographic proof and public signals are returned
 */

import { Router } from "express";
import rateLimit, { type Store } from "express-rate-limit";
import { z } from "zod";

import { ProofGenerationService } from "../../services/ProofGenerationService";
import { validateBody } from "../middleware/validate";

// Zod schema for proof generation requests
const proofGenerateSchema = z.object({
  ruleId: z.enum(['age_18', 'income_threshold', 'sanctions_clear']),
  privateInputs: z.record(z.unknown())
});

// Stricter rate limiter for proof generation (CPU-intensive operation)
// 10 requests per minute per IP
function createProofGenerationRateLimiter(store?: Store) {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    store,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many proof generation requests. Please try again later." }
  });
}

export function createProofGenerateRouter(
  service: ProofGenerationService,
  rateLimiterStore?: Store
): Router {
  const router = Router();

  router.post(
    "/",
    createProofGenerationRateLimiter(rateLimiterStore), // Apply stricter rate limit first
    validateBody(proofGenerateSchema),
    async (req, res) => {
      const { ruleId, privateInputs } = req.body as z.infer<typeof proofGenerateSchema>;

      try {
        // Generate proof - this is CPU-intensive and blocks the event loop
        // TODO: Move to worker thread or job queue before production load
        const result = await service.generateProof(ruleId, privateInputs);

        // Return only the proof and public signals
        // Private inputs are never included in the response
        res.status(200).json(result);
      } catch (error) {
        // Check if error is due to unknown ruleId
        if (error instanceof Error && error.message.startsWith('Unknown ruleId')) {
          res.status(400).json({
            error: "Invalid ruleId.",
            message: error.message
          });
          return;
        }

        // Generic error response - do not expose internal details
        res.status(500).json({
          error: "Proof generation failed.",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  return router;
}
