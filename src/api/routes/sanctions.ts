/**
 * Sanctions route - provides Merkle path lookups for the sanctions_clear circuit.
 */
import { Router } from "express";

import { MerkleTreeService } from "../../services/MerkleTreeService";

export function createSanctionsRouter(merkleTree: MerkleTreeService): Router {
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
      root: merkleTree.getRoot()
    });
  });

  return router;
}
