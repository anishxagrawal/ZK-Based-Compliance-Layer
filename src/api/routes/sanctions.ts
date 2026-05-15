/**
 * Sanctions route - Merkle path lookups and identity registration.
 *
 * Routes:
 *   GET  /sanctions/path/:commitment  - returns Merkle path for a commitment
 *   GET  /sanctions/root              - returns current tree root
 *   POST /sanctions/register          - registers a new identity commitment
 */
import { Router } from "express";
import { z } from "zod";

import { IMerkleTreeService } from "../../zk/interfaces/IMerkleTreeService";
import { validateBody } from "../middleware/validate";

const registerSchema = z.object({
  identityCommitment: z
    .string()
    .min(1, "identityCommitment is required")
    .regex(/^\d+$/, "identityCommitment must be a decimal number string")
});

export function createSanctionsRouter(merkleTree: IMerkleTreeService): Router {
  const router = Router();

  router.get("/path/:commitment", (req, res) => {
    const { commitment } = req.params;

    if (!commitment || !/^\d+$/.test(commitment)) {
      res.status(400).json({
        error: "Invalid commitment format. Expected a decimal number string."
      });
      return;
    }

    const path = merkleTree.getPath(commitment);

    if (!path) {
      res.status(404).json({
        error: "Identity commitment not found in sanctions whitelist."
      });
      return;
    }

    res.status(200).json(path);
  });

  router.get("/root", (_req, res) => {
    res.status(200).json({
      root: merkleTree.getRoot(),
      count: merkleTree.count()
    });
  });

  router.post("/register", validateBody(registerSchema), async (req, res) => {
    const { identityCommitment } = req.body as z.infer<typeof registerSchema>;

    try {
      const newRoot = await merkleTree.addCommitment(identityCommitment);

      res.status(201).json({
        success: true,
        root: newRoot,
        count: merkleTree.count(),
        message: "Identity registered. You can now generate a sanctions_clear proof."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const isClientError =
        message.includes("already registered") ||
        message.includes("Invalid commitment format");

      res.status(isClientError ? 400 : 500).json({
        error: isClientError ? "Registration rejected." : "Registration failed.",
        message
      });
    }
  });

  return router;
}
