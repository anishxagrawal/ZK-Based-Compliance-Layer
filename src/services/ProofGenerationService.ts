/**
 * Application service that generates ZK proofs for compliance rules.
 * 
 * This service resolves rule configurations and delegates proof generation
 * to the injected IProofGenerator implementation. It is completely rule-agnostic —
 * all rule-specific logic lives in src/config/rules.ts.
 * 
 * SECURITY: This service never logs privateInputs or any field inside privateInputs.
 * Private inputs are used only for proof generation and are never stored or returned.
 */

import { RULES, RuleConfig } from "../config/rules";
import { IProofGenerator } from "../zk/interfaces/IProofGenerator";

export interface ProofResult {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  };
  publicSignals: string[];
}

export class ProofGenerationService {
  constructor(
    private readonly generator: IProofGenerator,
    private readonly rules: Record<string, RuleConfig> = RULES
  ) {}

  /**
   * Generates a ZK proof for the specified compliance rule.
   * 
   * @param ruleId - The compliance rule identifier (e.g., 'age_18', 'income_threshold')
   * @param privateInputs - Private inputs required by the circuit (never logged or stored)
   * @returns Promise<ProofResult> containing the proof and public signals
   * @throws Error if ruleId is unknown
   */
  async generateProof(
    ruleId: string,
    privateInputs: Record<string, unknown>
  ): Promise<ProofResult> {
    // Resolve ruleId to rule config
    const rule = this.rules[ruleId];

    if (!rule) {
      throw new Error(`Unknown ruleId: ${ruleId}`);
    }

    // Generate proof using the configured wasm and zkey paths
    const result = await this.generator.generate(
      privateInputs,
      rule.wasmPath,
      rule.zkeyPath
    );

    // Return proof and public signals
    // Cast to ProofResult to ensure proper typing
    return result as ProofResult;
  }
}
