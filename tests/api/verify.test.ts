/**
 * Integration test for the /verify endpoint with request validation.
 */

import express from "express";
import request from "supertest";

import { createVerifyRouter } from "../../src/api/routes/verify";
import { IProofVerifier } from "../../src/zk/interfaces/IProofVerifier";

describe("POST /verify", () => {
  it("returns verified=true for a valid payload", async () => {
    const verifier: IProofVerifier = {
      verify: jest.fn().mockResolvedValue(true)
    };

    const app = express();
    app.use(express.json());
    app.use("/verify", createVerifyRouter(verifier));

    const response = await request(app)
      .post("/verify")
      .send({ proof: { pi_a: ["1", "2"] }, publicSignals: ["18"] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ verified: true });
  });

  it("returns 400 for invalid payload", async () => {
    const verifier: IProofVerifier = {
      verify: jest.fn().mockResolvedValue(true)
    };

    const app = express();
    app.use(express.json());
    app.use("/verify", createVerifyRouter(verifier));

    const response = await request(app).post("/verify").send({ invalid: true });

    expect(response.status).toBe(400);
  });
});
