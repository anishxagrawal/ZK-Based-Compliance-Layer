/**
 * Unit tests for nullifier computation utility.
 * 
 * Tests verify:
 * - Determinism: same inputs produce same output
 * - Uniqueness: different proofs produce different outputs
 * - Rule-specificity: different ruleIds produce different outputs
 * - Error handling: malformed proofs throw clear errors
 */

import { computeNullifier } from '../../src/utils/nullifier';
import { Proof } from '../../src/types/proof';

describe('computeNullifier', () => {
  const validProof: Proof = {
    pi_a: [
      '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
      '98765432109876543210987654321098765432109876543210987654321098765432109876543210'
    ],
    pi_b: [['1', '2'], ['3', '4']],
    pi_c: ['5', '6'],
    protocol: 'groth16'
  };

  const validRuleId = 'income_threshold';

  describe('determinism', () => {
    it('produces the same nullifier for the same proof and ruleId', () => {
      const nullifier1 = computeNullifier(validProof, validRuleId);
      const nullifier2 = computeNullifier(validProof, validRuleId);

      expect(nullifier1).toBe(nullifier2);
      expect(nullifier1).toMatch(/^[a-f0-9]{64}$/); // Valid hex string
    });

    it('produces consistent nullifier across multiple calls', () => {
      const nullifiers = Array.from({ length: 10 }, () => 
        computeNullifier(validProof, validRuleId)
      );

      const uniqueNullifiers = new Set(nullifiers);
      expect(uniqueNullifiers.size).toBe(1); // All identical
    });
  });

  describe('uniqueness', () => {
    it('produces different nullifiers for different proofs', () => {
      const proof1: Proof = {
        pi_a: ['111', '222'],
        pi_b: [['1', '2'], ['3', '4']],
        pi_c: ['5', '6']
      };

      const proof2: Proof = {
        pi_a: ['333', '444'], // Different pi_a
        pi_b: [['1', '2'], ['3', '4']],
        pi_c: ['5', '6']
      };

      const nullifier1 = computeNullifier(proof1, validRuleId);
      const nullifier2 = computeNullifier(proof2, validRuleId);

      expect(nullifier1).not.toBe(nullifier2);
    });

    it('produces different nullifiers when only pi_a[0] differs', () => {
      const proof1: Proof = {
        pi_a: ['111', '222']
      };

      const proof2: Proof = {
        pi_a: ['999', '222'] // Only first element differs
      };

      const nullifier1 = computeNullifier(proof1, validRuleId);
      const nullifier2 = computeNullifier(proof2, validRuleId);

      expect(nullifier1).not.toBe(nullifier2);
    });

    it('produces different nullifiers when only pi_a[1] differs', () => {
      const proof1: Proof = {
        pi_a: ['111', '222']
      };

      const proof2: Proof = {
        pi_a: ['111', '999'] // Only second element differs
      };

      const nullifier1 = computeNullifier(proof1, validRuleId);
      const nullifier2 = computeNullifier(proof2, validRuleId);

      expect(nullifier1).not.toBe(nullifier2);
    });
  });

  describe('rule-specificity', () => {
    it('produces different nullifiers for different ruleIds with same proof', () => {
      const nullifier1 = computeNullifier(validProof, 'income_threshold');
      const nullifier2 = computeNullifier(validProof, 'age_check');
      const nullifier3 = computeNullifier(validProof, 'sanctions_clear');

      expect(nullifier1).not.toBe(nullifier2);
      expect(nullifier2).not.toBe(nullifier3);
      expect(nullifier1).not.toBe(nullifier3);
    });

    it('allows same proof to be used for different rules', () => {
      // This test verifies the design decision to include ruleId in nullifier
      const rules = ['rule_a', 'rule_b', 'rule_c'];
      const nullifiers = rules.map(rule => computeNullifier(validProof, rule));

      // All nullifiers should be different
      const uniqueNullifiers = new Set(nullifiers);
      expect(uniqueNullifiers.size).toBe(rules.length);
    });
  });

  describe('error handling', () => {
    it('throws clear error for null proof', () => {
      expect(() => computeNullifier(null as unknown as Proof, validRuleId))
        .toThrow('Invalid proof: must be an object');
    });

    it('throws clear error for undefined proof', () => {
      expect(() => computeNullifier(undefined as unknown as Proof, validRuleId))
        .toThrow('Invalid proof: must be an object');
    });

    it('throws clear error for non-object proof', () => {
      expect(() => computeNullifier('not an object' as unknown as Proof, validRuleId))
        .toThrow('Invalid proof: must be an object');
    });

    it('throws clear error for missing pi_a', () => {
      const proofWithoutPiA: Proof = {
        pi_b: [['1', '2'], ['3', '4']],
        pi_c: ['5', '6']
      };

      expect(() => computeNullifier(proofWithoutPiA, validRuleId))
        .toThrow('Invalid proof: pi_a must be an array');
    });

    it('throws clear error for non-array pi_a', () => {
      const proofWithInvalidPiA: Proof = {
        pi_a: 'not an array' as unknown as string[]
      };

      expect(() => computeNullifier(proofWithInvalidPiA, validRuleId))
        .toThrow('Invalid proof: pi_a must be an array');
    });

    it('throws clear error for pi_a with insufficient elements', () => {
      const proofWithShortPiA: Proof = {
        pi_a: ['only_one_element']
      };

      expect(() => computeNullifier(proofWithShortPiA, validRuleId))
        .toThrow('Invalid proof: pi_a must have at least 2 elements');
    });

    it('throws clear error for non-string pi_a elements', () => {
      const proofWithNumberPiA: Proof = {
        pi_a: [123, 456] as unknown as string[]
      };

      expect(() => computeNullifier(proofWithNumberPiA, validRuleId))
        .toThrow('Invalid proof: pi_a elements must be strings');
    });

    it('throws clear error for empty string pi_a elements', () => {
      const proofWithEmptyPiA: Proof = {
        pi_a: ['', '222']
      };

      expect(() => computeNullifier(proofWithEmptyPiA, validRuleId))
        .toThrow('Invalid proof: pi_a elements cannot be empty strings');
    });

    it('throws clear error for empty ruleId', () => {
      expect(() => computeNullifier(validProof, ''))
        .toThrow('Invalid ruleId: must be a non-empty string');
    });

    it('throws clear error for non-string ruleId', () => {
      expect(() => computeNullifier(validProof, 123 as unknown as string))
        .toThrow('Invalid ruleId: must be a non-empty string');
    });
  });

  describe('output format', () => {
    it('returns a valid SHA256 hex string (64 characters)', () => {
      const nullifier = computeNullifier(validProof, validRuleId);

      expect(nullifier).toMatch(/^[a-f0-9]{64}$/);
      expect(nullifier.length).toBe(64);
    });

    it('returns lowercase hex string', () => {
      const nullifier = computeNullifier(validProof, validRuleId);

      expect(nullifier).toBe(nullifier.toLowerCase());
      expect(nullifier).not.toMatch(/[A-F]/); // No uppercase
    });
  });

  describe('real-world scenarios', () => {
    it('handles very long pi_a values (typical for elliptic curve points)', () => {
      const proofWithLongPiA: Proof = {
        pi_a: [
          '21888242871839275222246405745257275088548364400416034343698204186575808495617',
          '21888242871839275222246405745257275088548364400416034343698204186575808495616'
        ]
      };

      const nullifier = computeNullifier(proofWithLongPiA, validRuleId);

      expect(nullifier).toMatch(/^[a-f0-9]{64}$/);
    });

    it('handles special characters in ruleId', () => {
      const specialRuleIds = [
        'rule-with-dashes',
        'rule_with_underscores',
        'rule.with.dots',
        'rule:with:colons'
      ];

      specialRuleIds.forEach(ruleId => {
        expect(() => computeNullifier(validProof, ruleId)).not.toThrow();
      });
    });
  });
});
