/**
 * Verification route that validates payloads and checks proof validity.
 */

import { readFile } from "fs/promises";
import { Router } from "express";
import { z } from "zod";

import { RULES } from "../../config/rules";
import { VerifyResponse } from "../../types/proof";
import { IProofVerifier } from "../../zk/interfaces/IProofVerifier";
import { validateBody } from "../middleware/validate";

const verifySchema = z.object({
  proof: z.record(z.unknown()),
  publicSignals: z.array(z.union([z.string(), z.number()]))
});

export function createVerifyRouter(verifier: IProofVerifier): Router {
  const router = Router();

  router.post("/", validateBody(verifySchema), async (req, res) => {
    try {
      const defaultRule = RULES.age_18;
      const vKeyContent = await readFile(defaultRule.vKeyPath, "utf-8");
      const vKey = JSON.parse(vKeyContent) as Record<string, unknown>;

      const verified = await verifier.verify(req.body.proof, req.body.publicSignals, vKey);
      const response: VerifyResponse = { verified };
      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({
        error: "Verification failed.",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  return router;
}
