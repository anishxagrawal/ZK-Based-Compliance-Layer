/**
 * Contract for proof verification adapters used by application services.
 */

import { Proof } from "../../types/proof";

export interface IProofVerifier {
  verify(
    proof: Proof,
    publicSignals: Array<string | number>,
    vKey: Record<string, unknown>
  ): Promise<boolean>;
}
