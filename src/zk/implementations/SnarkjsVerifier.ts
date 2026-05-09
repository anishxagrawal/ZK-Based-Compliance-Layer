/**
 * snarkjs-backed verifier implementation for Groth16 proofs.
 */

import { groth16 } from "snarkjs";

import { Proof } from "../../types/proof";
import { IProofVerifier } from "../interfaces/IProofVerifier";

export class SnarkjsVerifier implements IProofVerifier {
  async verify(
    proof: Proof,
    publicSignals: Array<string | number>,
    vKey: Record<string, unknown>
  ): Promise<boolean> {
    return groth16.verify(vKey as never, publicSignals.map(String), proof as never);
  }
}
