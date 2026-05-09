/**
 * Shared request and response contracts for ZK proof verification endpoints.
 */

export type Proof = Record<string, unknown>;

export interface ProofRequest {
  proof: Proof;
  publicSignals: Array<string | number>;
}

export interface ComplianceRequest extends ProofRequest {
  ruleId: string;
}

export interface VerifyResponse {
  verified: boolean;
}

export interface ComplianceResponse {
  compliant: boolean;
}
