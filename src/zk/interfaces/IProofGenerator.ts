/**
 * Contract for generating ZK proofs from inputs and compiled circuit artifacts.
 */

import { Proof } from "../../types/proof";

export interface IProofGenerator {
  generate(
    input: Record<string, unknown>,
    wasmPath: string,
    zkeyPath: string
  ): Promise<{ proof: Proof; publicSignals: Array<string | number> }>;
}
