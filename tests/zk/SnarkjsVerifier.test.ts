/**
 * Unit tests for the snarkjs-backed verifier adapter.
 */

import { SnarkjsVerifier } from "../../src/zk/implementations/SnarkjsVerifier";

jest.mock("snarkjs", () => ({
  groth16: {
    verify: jest.fn()
  }
}));

describe("SnarkjsVerifier", () => {
  it("returns true when snarkjs verifies proof", async () => {
    const verifier = new SnarkjsVerifier();
    const mockedGroth16 = jest.requireMock("snarkjs").groth16 as {
      verify: jest.Mock;
    };
    const proof = { pi_a: ["1", "2"] };
    const publicSignals = ["18"];
    const vKey = { protocol: "groth16" };

    mockedGroth16.verify.mockResolvedValue(true);

    const result = await verifier.verify(proof, publicSignals, vKey);

    expect(result).toBe(true);
    expect(mockedGroth16.verify).toHaveBeenCalledWith(vKey, publicSignals, proof);
  });
});
