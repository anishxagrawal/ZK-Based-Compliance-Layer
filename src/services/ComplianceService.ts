/**
 * Application service that resolves compliance rules and verifies submitted proofs.
 * 
 * This service implements replay attack prevention using a nullifier registry.
 * Each proof can only be used once per rule to prevent abuse.
 */

import { readFile } from "fs/promises";

import { RULES, RuleConfig } from "../config/rules";
import { ComplianceRequest } from "../types/proof";
import { computeNullifier } from "../utils/nullifier";
import { INullifierRegistry } from "../zk/interfaces/INullifierRegistry";
import { IProofVerifier } from "../zk/interfaces/IProofVerifier";

export class ComplianceService {
  constructor(
    private readonly verifier: IProofVerifier,
    private readonly nullifierRegistry: INullifierRegistry,
    private readonly rules: Record<string, RuleConfig> = RULES
  ) {}

  /**
   * Checks if a proof satisfies a compliance rule.
   * 
   * Sequence:
   * 1. Resolve ruleId to rule config (throw if unknown)
   * 2. Compute nullifier from proof and ruleId
   * 3. Check if nullifier already used (throw if replay attempt)
   * 4. Load verification key
   * 5. Verify proof cryptographically
   * 6. Store nullifier ONLY if verification succeeds
   * 7. Return verification result
   * 
   * @param request - Compliance request containing ruleId, proof, and publicSignals
   * @returns Promise<true> if proof is valid and compliant, Promise<false> if invalid
   * @throws Error if ruleId unknown or proof already used (replay attack)
   */
  async checkCompliance(request: ComplianceRequest): Promise<boolean> {
    // Step 1: Resolve ruleId to rule config
    const rule = this.rules[request.ruleId];

    if (!rule) {
      throw new Error(`Unknown ruleId: ${request.ruleId}`);
    }

    // Step 2: Compute nullifier from proof and ruleId
    const nullifier = computeNullifier(request.proof, request.ruleId);

    // Step 3: Check if nullifier already used (replay prevention)
    const alreadyUsed = await this.nullifierRegistry.has(nullifier);

    if (alreadyUsed) {
      // This is an abuse attempt, not a compliance failure
      // Throw error to return 500 and alert monitoring systems
      throw new Error('Proof already used');
    }

    // Step 4: Load verification key from disk
    const vKeyContent = await readFile(rule.vKeyPath, "utf-8");
    const vKey = JSON.parse(vKeyContent) as Record<string, unknown>;

    // Step 5: Verify proof cryptographically
    const isValid = await this.verifier.verify(request.proof, request.publicSignals, vKey);

    // Step 6: Store nullifier ONLY if verification succeeds
    if (isValid) {
      await this.nullifierRegistry.store(nullifier);
    }
    // CRITICAL: Do NOT store nullifier if verification fails
    // Storing invalid proof nullifiers enables denial-of-service attacks

    // Step 7: Return verification result
    return isValid;
  }
}
