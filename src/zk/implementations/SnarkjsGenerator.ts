/**
 * snarkjs-backed proof generator implementation for Groth16 full prove flow.
 */

import { groth16 } from "snarkjs";

import { IProofGenerator } from "../interfaces/IProofGenerator";

export class SnarkjsGenerator implements IProofGenerator {
  async generate(
    input: Record<string, unknown>,
    wasmPath: string,
    zkeyPath: string
  ): Promise<{ proof: Record<string, unknown>; publicSignals: Array<string | number> }> {
    const { proof, publicSignals } = await groth16.fullProve(input as never, wasmPath, zkeyPath);
    return { proof: proof as unknown as Record<string, unknown>, publicSignals };
  }
}
