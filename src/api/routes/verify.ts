/**
 * Verification route that validates payloads and checks proof validity.
 *
 * This is a raw cryptographic verification endpoint. It checks whether
 * a proof is valid for the given public signals and ruleId.
 */

import { readFile } from "fs/promises";
import { Router } from "express";
import { z } from "zod";

import { RULES } from "../../config/rules";
import { VerifyResponse } from "../../types/proof";
import { IProofVerifier } from "../../zk/interfaces/IProofVerifier";
import { validateBody } from "../middleware/validate";

const verifySchema = z.object({
  ruleId: z.string().min(1),
  proof: z.record(z.unknown()),
  publicSignals: z.array(z.union([z.string(), z.number()]))
});

export function createVerifyRouter(verifier: IProofVerifier): Router {
  const router = Router();

  router.post("/", validateBody(verifySchema), async (req, res) => {
    try {
      const { ruleId, proof, publicSignals } = req.body as z.infer<typeof verifySchema>;
      const rule = RULES[ruleId];

      if (!rule) {
        res.status(400).json({
          error: "Invalid ruleId.",
          message: `Unknown ruleId: ${ruleId}. Valid values: ${Object.keys(RULES).join(", ")}`
        });
        return;
      }

      const vKeyContent = await readFile(rule.vKeyPath, "utf-8");
      const vKey = JSON.parse(vKeyContent) as Record<string, unknown>;

      const verified = await verifier.verify(proof, publicSignals, vKey);
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
