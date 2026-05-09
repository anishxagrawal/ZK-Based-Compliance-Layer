/**
 * Unit tests for compliance service behavior with injected verifier dependency.
 * Tests verify nullifier registry integration and replay attack prevention.
 */

import path from "path";

import { ComplianceService } from "../../src/services/ComplianceService";
import { INullifierRegistry } from "../../src/zk/interfaces/INullifierRegistry";
import { IProofVerifier } from "../../src/zk/interfaces/IProofVerifier";

describe("ComplianceService", () => {
  let mockVerifier: IProofVerifier;
  let mockNullifierRegistry: INullifierRegistry;

  beforeEach(() => {
    // Reset mocks before each test
    mockVerifier = {
      verify: jest.fn().mockResolvedValue(true)
    };

    mockNullifierRegistry = {
      has: jest.fn().mockResolvedValue(false),
      store: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0)
    };
  });

  it("delegates verification to injected IProofVerifier", async () => {
    const service = new ComplianceService(mockVerifier, mockNullifierRegistry, {
      age_18: {
        vKeyPath: path.resolve(process.cwd(), "src/keys/verification_key.json"),
        wasmPath: "unused",
        zkeyPath: "unused"
      }
    });

    const result = await service.checkCompliance({
      ruleId: "age_18",
      proof: { pi_a: ["1", "2"] },
      publicSignals: ["18"]
    });

    expect(result).toBe(true);
    expect(mockVerifier.verify).toHaveBeenCalledTimes(1);
  });

  it("checks nullifier registry before verification", async () => {
    const service = new ComplianceService(mockVerifier, mockNullifierRegistry, {
      age_18: {
        vKeyPath: path.resolve(process.cwd(), "src/keys/verification_key.json"),
        wasmPath: "unused",
        zkeyPath: "unused"
      }
    });

    await service.checkCompliance({
      ruleId: "age_18",
      proof: { pi_a: ["1", "2"] },
      publicSignals: ["18"]
    });

    // Verify nullifier check happened
    expect(mockNullifierRegistry.has).toHaveBeenCalledTimes(1);
    expect(mockNullifierRegistry.has).toHaveBeenCalledWith(expect.any(String));
  });

  it("stores nullifier after successful verification", async () => {
    mockVerifier.verify = jest.fn().mockResolvedValue(true);

    const service = new ComplianceService(mockVerifier, mockNullifierRegistry, {
      age_18: {
        vKeyPath: path.resolve(process.cwd(), "src/keys/verification_key.json"),
        wasmPath: "unused",
        zkeyPath: "unused"
      }
    });

    const result = await service.checkCompliance({
      ruleId: "age_18",
      proof: { pi_a: ["1", "2"] },
      publicSignals: ["18"]
    });

    expect(result).toBe(true);
    expect(mockNullifierRegistry.store).toHaveBeenCalledTimes(1);
    expect(mockNullifierRegistry.store).toHaveBeenCalledWith(expect.any(String));
  });

  it("rejects duplicate proof submission", async () => {
    // First call: nullifier not used
    mockNullifierRegistry.has = jest.fn()
      .mockResolvedValueOnce(false)  // First submission: not used
      .mockResolvedValueOnce(true);  // Second submission: already used

    mockVerifier.verify = jest.fn().mockResolvedValue(true);

    const service = new ComplianceService(mockVerifier, mockNullifierRegistry, {
      age_18: {
        vKeyPath: path.resolve(process.cwd(), "src/keys/verification_key.json"),
        wasmPath: "unused",
        zkeyPath: "unused"
      }
    });

    const proof = { pi_a: ["1", "2"] };
    const publicSignals = ["18"];

    // First submission should succeed
    const result1 = await service.checkCompliance({
      ruleId: "age_18",
      proof,
      publicSignals
    });

    expect(result1).toBe(true);
    expect(mockNullifierRegistry.store).toHaveBeenCalledTimes(1);

    // Second submission with same proof should throw
    await expect(
      service.checkCompliance({
        ruleId: "age_18",
        proof,
        publicSignals
      })
    ).rejects.toThrow('Proof already used');

    // Verify that verification was never called for the second attempt
    expect(mockVerifier.verify).toHaveBeenCalledTimes(1); // Only first call
  });

  it("does not store nullifier for invalid proof", async () => {
    // Mock verifier to return false (invalid proof)
    mockVerifier.verify = jest.fn().mockResolvedValue(false);

    const service = new ComplianceService(mockVerifier, mockNullifierRegistry, {
      age_18: {
        vKeyPath: path.resolve(process.cwd(), "src/keys/verification_key.json"),
        wasmPath: "unused",
        zkeyPath: "unused"
      }
    });

    const result = await service.checkCompliance({
      ruleId: "age_18",
      proof: { pi_a: ["1", "2"] },
      publicSignals: ["18"]
    });

    expect(result).toBe(false);
    expect(mockVerifier.verify).toHaveBeenCalledTimes(1);
    
    // CRITICAL: nullifier should NOT be stored for invalid proof
    expect(mockNullifierRegistry.store).not.toHaveBeenCalled();
  });

  it("throws error for unknown ruleId", async () => {
    const service = new ComplianceService(mockVerifier, mockNullifierRegistry, {
      age_18: {
        vKeyPath: path.resolve(process.cwd(), "src/keys/verification_key.json"),
        wasmPath: "unused",
        zkeyPath: "unused"
      }
    });

    await expect(
      service.checkCompliance({
        ruleId: "nonexistent",
        proof: { pi_a: ["1", "2"] },
        publicSignals: ["18"]
      })
    ).rejects.toThrow('Unknown ruleId: nonexistent');

    // Verify nullifier was never checked or stored
    expect(mockNullifierRegistry.has).not.toHaveBeenCalled();
    expect(mockNullifierRegistry.store).not.toHaveBeenCalled();
  });

  it("computes different nullifiers for different ruleIds", async () => {
    const service = new ComplianceService(mockVerifier, mockNullifierRegistry, {
      rule_a: {
        vKeyPath: path.resolve(process.cwd(), "src/keys/verification_key.json"),
        wasmPath: "unused",
        zkeyPath: "unused"
      },
      rule_b: {
        vKeyPath: path.resolve(process.cwd(), "src/keys/verification_key.json"),
        wasmPath: "unused",
        zkeyPath: "unused"
      }
    });

    const proof = { pi_a: ["1", "2"] };
    const publicSignals = ["18"];

    // Submit same proof for rule_a
    await service.checkCompliance({
      ruleId: "rule_a",
      proof,
      publicSignals
    });

    // Submit same proof for rule_b
    await service.checkCompliance({
      ruleId: "rule_b",
      proof,
      publicSignals
    });

    // Both should succeed because nullifiers are different
    expect(mockNullifierRegistry.store).toHaveBeenCalledTimes(2);
    
    // Get the nullifiers that were stored
    const call1 = (mockNullifierRegistry.store as jest.Mock).mock.calls[0][0];
    const call2 = (mockNullifierRegistry.store as jest.Mock).mock.calls[1][0];
    
    // Nullifiers should be different
    expect(call1).not.toBe(call2);
  });
});
