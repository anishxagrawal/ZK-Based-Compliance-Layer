/**
 * Compliance route that validates payloads and delegates checks to the service layer.
 * Also provides nullifier registry inspection endpoints for monitoring and client checks.
 */

import { Router } from "express";
import { z } from "zod";

import { ComplianceService } from "../../services/ComplianceService";
import { ComplianceResponse } from "../../types/proof";
import { INullifierRegistry } from "../../zk/interfaces/INullifierRegistry";
import { validateBody } from "../middleware/validate";

const complianceSchema = z.object({
  ruleId: z.string().min(1),
  proof: z.record(z.unknown()),
  publicSignals: z.array(z.union([z.string(), z.number()]))
});

export function createComplianceRouter(
  complianceService: ComplianceService,
  nullifierRegistry: INullifierRegistry
): Router {
  const router = Router();

  router.post("/check", validateBody(complianceSchema), async (req, res) => {
    try {
      const compliant = await complianceService.checkCompliance(req.body);
      const response: ComplianceResponse = { compliant };
      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({
        error: "Compliance evaluation failed.",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  /**
   * GET /compliance/nullifier/count
   * 
   * Returns the total number of registered nullifiers.
   * Useful for monitoring and capacity planning.
   * 
   * Returns: { count: number }
   * 
   * IMPORTANT: This route must come BEFORE /nullifier/:hash
   * to avoid "count" being interpreted as a hash parameter.
   */
  router.get("/nullifier/count", async (_req, res) => {
    try {
      const count = await nullifierRegistry.count();
      res.status(200).json({ count });
    } catch (error) {
      res.status(500).json({
        error: "Failed to get nullifier count.",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  /**
   * GET /compliance/nullifier/:hash
   * 
   * Checks if a specific nullifier has been used.
   * Useful for clients to check before submitting a proof.
   * 
   * Returns: { used: boolean }
   */
  router.get("/nullifier/:hash", async (req, res) => {
    try {
      const { hash } = req.params;
      
      // Validate hash format (64-character hex string)
      if (!/^[a-f0-9]{64}$/.test(hash)) {
        res.status(400).json({
          error: "Invalid nullifier hash format. Expected 64-character hex string."
        });
        return;
      }

      const used = await nullifierRegistry.has(hash);
      res.status(200).json({ used });
    } catch (error) {
      res.status(500).json({
        error: "Failed to check nullifier.",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  return router;
}
