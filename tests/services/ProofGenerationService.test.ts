/**
 * Unit tests for ProofGenerationService with injected IProofGenerator dependency.
 * Tests verify rule resolution, error handling, and proper delegation to generator.
 */

import path from "path";

import { ProofGenerationService } from "../../src/services/ProofGenerationService";
import { IProofGenerator } from "../../src/zk/interfaces/IProofGenerator";

describe("ProofGenerationService", () => {
  let mockGenerator: IProofGenerator;

  beforeEach(() => {
    // Reset mock before each test
    mockGenerator = {
      generate: jest.fn().mockResolvedValue({
        proof: {
          pi_a: ["1", "2", "1"],
          pi_b: [["1", "2"], ["3", "4"], ["5", "6"]],
          pi_c: ["7", "8", "1"],
          protocol: "groth16",
          curve: "bn128"
        },
        publicSignals: ["18"]
      })
    };
  });

  it("delegates proof generation to injected IProofGenerator", async () => {
    const service = new ProofGenerationService(mockGenerator, {
      age_18: {
        vKeyPath: "unused",
        wasmPath: path.resolve(process.cwd(), "circuits/age_check_js/age_check.wasm"),
        zkeyPath: path.resolve(process.cwd(), "age_check_0.zkey")
      }
    });

    const privateInputs = { age: "25", secret: "12345" };
    const result = await service.generateProof("age_18", privateInputs);

    expect(result.proof).toBeDefined();
    expect(result.publicSignals).toEqual(["18"]);
    expect(mockGenerator.generate).toHaveBeenCalledTimes(1);
    expect(mockGenerator.generate).toHaveBeenCalledWith(
      privateInputs,
      path.resolve(process.cwd(), "circuits/age_check_js/age_check.wasm"),
      path.resolve(process.cwd(), "age_check_0.zkey")
    );
  });

  it("resolves ruleId to correct circuit paths", async () => {
    const service = new ProofGenerationService(mockGenerator, {
      income_threshold: {
        vKeyPath: "unused",
        wasmPath: path.resolve(process.cwd(), "circuits/income_threshold_js/income_threshold.wasm"),
        zkeyPath: path.resolve(process.cwd(), "income_threshold_0.zkey")
      }
    });

    const privateInputs = {
      income: "7500000",
      blinding_factor: "123456",
      threshold: "5000000",
      commitment: "999"
    };

    await service.generateProof("income_threshold", privateInputs);

    expect(mockGenerator.generate).toHaveBeenCalledWith(
      privateInputs,
      path.resolve(process.cwd(), "circuits/income_threshold_js/income_threshold.wasm"),
      path.resolve(process.cwd(), "income_threshold_0.zkey")
    );
  });

  it("throws error for unknown ruleId", async () => {
    const service = new ProofGenerationService(mockGenerator, {
      age_18: {
        vKeyPath: "unused",
        wasmPath: path.resolve(process.cwd(), "circuits/age_check_js/age_check.wasm"),
        zkeyPath: path.resolve(process.cwd(), "age_check_0.zkey")
      }
    });

    await expect(
      service.generateProof("nonexistent", { age: "25" })
    ).rejects.toThrow("Unknown ruleId: nonexistent");

    // Verify generator was never called
    expect(mockGenerator.generate).not.toHaveBeenCalled();
  });

  it("propagates generator errors", async () => {
    mockGenerator.generate = jest.fn().mockRejectedValue(
      new Error("Witness generation failed: constraint not satisfied")
    );

    const service = new ProofGenerationService(mockGenerator, {
      age_18: {
        vKeyPath: "unused",
        wasmPath: path.resolve(process.cwd(), "circuits/age_check_js/age_check.wasm"),
        zkeyPath: path.resolve(process.cwd(), "age_check_0.zkey")
      }
    });

    await expect(
      service.generateProof("age_18", { age: "15" })
    ).rejects.toThrow("Witness generation failed: constraint not satisfied");
  });

  it("handles multiple rule configurations", async () => {
    const service = new ProofGenerationService(mockGenerator, {
      rule_a: {
        vKeyPath: "unused",
        wasmPath: path.resolve(process.cwd(), "circuits/a.wasm"),
        zkeyPath: path.resolve(process.cwd(), "a.zkey")
      },
      rule_b: {
        vKeyPath: "unused",
        wasmPath: path.resolve(process.cwd(), "circuits/b.wasm"),
        zkeyPath: path.resolve(process.cwd(), "b.zkey")
      }
    });

    // Generate proof for rule_a
    await service.generateProof("rule_a", { input: "1" });
    expect(mockGenerator.generate).toHaveBeenCalledWith(
      { input: "1" },
      path.resolve(process.cwd(), "circuits/a.wasm"),
      path.resolve(process.cwd(), "a.zkey")
    );

    // Generate proof for rule_b
    await service.generateProof("rule_b", { input: "2" });
    expect(mockGenerator.generate).toHaveBeenCalledWith(
      { input: "2" },
      path.resolve(process.cwd(), "circuits/b.wasm"),
      path.resolve(process.cwd(), "b.zkey")
    );

    expect(mockGenerator.generate).toHaveBeenCalledTimes(2);
  });

  it("returns proof with correct structure", async () => {
    const mockProof = {
      proof: {
        pi_a: ["123", "456", "1"],
        pi_b: [["1", "2"], ["3", "4"], ["5", "6"]],
        pi_c: ["789", "012", "1"],
        protocol: "groth16",
        curve: "bn128"
      },
      publicSignals: ["5000000", "999888777"]
    };

    mockGenerator.generate = jest.fn().mockResolvedValue(mockProof);

    const service = new ProofGenerationService(mockGenerator, {
      income_threshold: {
        vKeyPath: "unused",
        wasmPath: path.resolve(process.cwd(), "circuits/income_threshold_js/income_threshold.wasm"),
        zkeyPath: path.resolve(process.cwd(), "income_threshold_0.zkey")
      }
    });

    const result = await service.generateProof("income_threshold", {
      income: "7500000",
      blinding_factor: "123",
      threshold: "5000000",
      commitment: "999888777"
    });

    expect(result).toEqual(mockProof);
    expect(result.proof.pi_a).toHaveLength(3);
    expect(result.proof.pi_b).toHaveLength(3);
    expect(result.proof.pi_c).toHaveLength(3);
    expect(result.publicSignals).toHaveLength(2);
  });
});
