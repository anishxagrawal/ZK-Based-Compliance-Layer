/**
 * Pure utility for computing deterministic nullifiers from ZK proofs.
 * 
 * A nullifier is a unique identifier derived from a proof that enables
 * replay attack prevention without revealing the proof contents.
 * 
 * Formula: SHA256(pi_a[0] + pi_a[1] + ruleId)
 * 
 * Properties:
 * - Deterministic: same proof + ruleId always produces same nullifier
 * - Unique: different proofs produce different nullifiers
 * - One-way: nullifier reveals nothing about the proof or identity
 * - Rule-specific: same proof can be used for different rules
 */

import { createHash } from 'crypto';

import { Proof } from '../types/proof';

/**
 * Computes a nullifier hash from a proof and ruleId.
 * 
 * @param proof - The ZK proof object containing pi_a array
 * @param ruleId - The compliance rule identifier
 * @returns Hex string of SHA256 hash (64 characters)
 * @throws Error if proof structure is invalid or pi_a is missing/malformed
 */
export function computeNullifier(proof: Proof, ruleId: string): string {
  // Validate proof structure
  if (!proof || typeof proof !== 'object') {
    throw new Error('Invalid proof: must be an object');
  }

  // Extract pi_a safely
  const piA = proof.pi_a;
  
  if (!Array.isArray(piA)) {
    throw new Error('Invalid proof: pi_a must be an array');
  }

  if (piA.length < 2) {
    throw new Error('Invalid proof: pi_a must have at least 2 elements');
  }

  // Validate pi_a elements are strings
  const piA0 = piA[0];
  const piA1 = piA[1];

  if (typeof piA0 !== 'string' || typeof piA1 !== 'string') {
    throw new Error('Invalid proof: pi_a elements must be strings');
  }

  if (piA0.length === 0 || piA1.length === 0) {
    throw new Error('Invalid proof: pi_a elements cannot be empty strings');
  }

  // Validate ruleId
  if (typeof ruleId !== 'string' || ruleId.length === 0) {
    throw new Error('Invalid ruleId: must be a non-empty string');
  }

  // Compute nullifier: SHA256(pi_a[0] + pi_a[1] + ruleId)
  const input = piA0 + piA1 + ruleId;
  const hash = createHash('sha256').update(input).digest('hex');

  return hash;
}
