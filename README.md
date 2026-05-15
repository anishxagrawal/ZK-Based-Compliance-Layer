# ZK-Based Compliance Layer

A privacy-preserving compliance API using Groth16 zero-knowledge proofs. Private inputs — age, income, identity secrets — are processed entirely in the browser and never transmitted to the server. Only the cryptographic proof and public signals are sent.

Built with TypeScript, Express, circom 2.1.6, snarkjs, and Redis.

---

## What It Does

Traditional compliance systems require users to reveal sensitive data to a server to prove they meet a requirement. This system inverts that — users prove compliance without revealing the underlying data.

| Requirement | What the server learns | What stays private |
|---|---|---|
| Age ≥ 18 | The threshold (18) | Your actual age |
| Income ≥ threshold | The threshold and a commitment hash | Your actual income |
| Identity on whitelist | The Merkle root and commitment hash | Which identity, what the secret is |

---

## Circuits

Three Groth16 circuits compiled with circom 2.1.6:

### `age_check` — Age Verification
Proves `age >= threshold` without revealing age.

```
Private inputs:  age
Public inputs:   threshold
Public outputs:  valid (1 or 0)
```

### `income_threshold` — Income Threshold
Proves `income >= threshold` using a Poseidon commitment. The commitment binds the proof to a specific income value without revealing it.

```
Private inputs:  income, blinding_factor
Public inputs:   threshold, commitment (Poseidon(income, blinding_factor))
```

### `sanctions_clear` — Merkle Tree Inclusion
Proves identity is in an approved whitelist using a 10-level Poseidon Merkle tree. The prover knows a secret whose hash is a leaf in the tree.

```
Private inputs:  identity_secret, pathElements[10], pathIndices[10]
Public inputs:   root, identityCommitment (Poseidon(identity_secret))
Tree depth:      10 levels, 1024 leaf capacity
```

---

## Architecture

```
src/
├── api/
│   ├── app.ts                          — composition root, wires all dependencies
│   ├── middleware/
│   │   ├── auth.ts                     — API key authentication
│   │   ├── rateLimiter.ts              — express-rate-limit
│   │   └── validate.ts                 — Zod request validation
│   └── routes/
│       ├── compliance.ts               — POST /compliance/check
│       ├── verify.ts                   — POST /verify
│       ├── sanctions.ts                — GET/POST /sanctions/*
│       └── proofGenerate.ts            — POST /proof/generate (dev only)
├── services/
│   ├── ComplianceService.ts            — proof verification + nullifier flow
│   ├── ProofGenerationService.ts       — server-side proof generation (dev only)
│   └── MerkleTreeService.ts            — Poseidon Merkle tree with Redis persistence
├── zk/
│   ├── interfaces/
│   │   ├── IProofVerifier.ts
│   │   ├── IProofGenerator.ts
│   │   ├── INullifierRegistry.ts
│   │   └── IMerkleTreeService.ts
│   └── implementations/
│       ├── SnarkjsVerifier.ts
│       ├── SnarkjsGenerator.ts
│       ├── RedisNullifierRegistry.ts
│       └── InMemoryNullifierRegistry.ts
├── config/
│   └── rules.ts                        — circuit artifact paths per ruleId
├── types/
│   ├── proof.ts                        — shared request/response types
│   └── circomlibjs.d.ts                — type declarations for circomlibjs
└── utils/
    └── nullifier.ts                    — deterministic nullifier computation

public/
├── index.html                          — landing page with live status
├── age-check.html                      — age verification demo
├── income-threshold.html               — income threshold demo
├── sanctions-clear.html                — sanctions whitelist demo
├── zk-client.js                        — browser proof engine
└── js/
    └── circomlibjs.bundle.js           — local circomlibjs build (avoids CDN mismatch)

circuits/
├── age_check.circom
├── income_threshold.circom
└── sanctions_clear.circom
```

### Dependency Rule

Five architectural layers with strict inward-only dependencies:

```
Layer 1 (innermost):  src/zk/interfaces/       — pure contracts
Layer 2:              src/zk/implementations/  — concrete ZK implementations
Layer 3:              src/services/            — application services
Layer 4:              src/api/routes/          — HTTP route handlers
Layer 5 (outermost):  src/api/app.ts           — composition root
```

No inner layer imports from an outer layer. Services depend on interfaces, not concrete implementations. Verified with `tsc --noEmit` — zero dependency violations.

---

## How a Proof Works (End to End)

```
1. User opens browser page and enters private inputs
2. Browser fetches circuit WASM and zkey from server (cached immutably)
3. snarkjs.groth16.fullProve() runs locally in Web Workers
   — private inputs used here, never transmitted
4. Browser POSTs { ruleId, proof, publicSignals } to /compliance/check
   — private inputs are absent from this request
5. Server loads verification key for the ruleId
6. groth16.verify(vKey, publicSignals, proof) — cryptographic check
7. Nullifier computed from proof.pi_a + ruleId, checked against Redis
8. If valid: nullifier stored in Redis, { compliant: true } returned
9. Proof is now consumed — same proof rejected on any future submission
```

---

## API Endpoints

All endpoints require `x-api-key` header.

### `POST /compliance/check`
Full compliance flow — verifies proof and consumes it (one-time use).

```json
Request:
{
  "ruleId": "age_18" | "income_threshold" | "sanctions_clear",
  "proof": { "pi_a": [...], "pi_b": [...], "pi_c": [...], "protocol": "groth16" },
  "publicSignals": ["...", "..."]
}

Response 200:
{ "compliant": true | false }

Response 500:
{ "error": "Compliance evaluation failed.", "message": "Proof already used" }
```

### `POST /verify`
Dry-run cryptographic check — does NOT consume the proof, no nullifier stored.

```json
Request:
{
  "ruleId": "age_18" | "income_threshold" | "sanctions_clear",
  "proof": { ... },
  "publicSignals": ["...", "..."]
}

Response 200:
{ "verified": true | false }
```

### `GET /sanctions/path/:commitment`
Returns the Merkle path for a given identity commitment.

```json
Response 200:
{
  "root": "8117177...",
  "pathElements": ["17407676...", ...],  // 10 sibling hashes
  "pathIndices": [0, 0, 1, 0, ...]       // 10 direction flags
}

Response 404:
{ "error": "Identity commitment not found in sanctions whitelist." }
```

### `POST /sanctions/register`
Registers a new identity commitment. Persists to Redis and rebuilds the Merkle tree.

```json
Request:
{ "identityCommitment": "18587147..." }

Response 201:
{
  "success": true,
  "root": "<new root after rebuild>",
  "count": 6,
  "message": "Identity registered. You can now generate a sanctions_clear proof."
}

Response 400:
{ "error": "Registration rejected.", "message": "Commitment already registered." }
```

### `GET /sanctions/root`
Returns the current Merkle tree root and identity count.

```json
Response 200:
{ "root": "8117177...", "count": 5 }
```

### `GET /health`
Returns API and Redis status.

```json
Response 200:
{ "status": "ok" | "degraded", "redis": "connected" | "disconnected", "timestamp": "..." }
```

### `GET /docs`
Returns the OpenAPI specification as JSON.

### `POST /proof/generate` *(development only)*
Server-side proof generation. Only mounted when `NODE_ENV=development`.
Disabled in production — all proof generation happens client-side.

---

## Redis Data Model

| Key | Type | Purpose | TTL |
|---|---|---|---|
| `nullifiers:all` | SET | All consumed proof nullifiers | 90 days |
| `sanctions:commitments` | LIST | Approved identity commitments | None |

---

## Getting Started

### Prerequisites

- Node.js >= 20
- Redis running on `localhost:6379`
- npm

### Install

```bash
git clone https://github.com/anishxagrawal/ZK-Based-Compliance-Layer.git
cd ZK-Based-Compliance-Layer
npm install
```

### Environment

Create a `.env` file in the project root:

```env
API_KEY=your-api-key-here
REDIS_URL=redis://localhost:6379
PORT=3000
```

### Run (Development)

```bash
npm run dev
```

Server starts at `http://localhost:3000`. The `/proof/generate` endpoint is
available in development mode only.

On first boot with an empty Redis instance, the server seeds 5 test identities
into the Merkle tree automatically.

### Run (Production)

```bash
npm run build
npm start
```

The `/proof/generate` endpoint is not mounted in production.

### Open the Demo

```
http://localhost:3000
```

Landing page links to all three circuit demos.

---

## Testing

```bash
npm test
```

Tests use `ioredis-mock` for Redis — no real Redis instance required for the test suite.

---

## Browser Demo Flow

### Age Verification (`/age-check.html`)
1. Enter your age (private) and the minimum threshold (public)
2. Click **Prove & Submit**
3. Proof generates locally (~0.2s), submits to server
4. Returns `{ compliant: true }` if age ≥ threshold

### Income Threshold (`/income-threshold.html`)
1. Enter income and blinding factor (both private)
2. Click **Compute Commitment** — generates `Poseidon(income, blinding_factor)`
3. Click **Prove & Submit**
4. Returns `{ compliant: true }` if income ≥ threshold (~0.3s)

### Sanctions Clear (`/sanctions-clear.html`)
1. **Register** — enter a secret, click Register Identity
   - Browser computes `Poseidon(secret)`, sends only the hash to the server
   - Server adds commitment to Merkle tree and rebuilds
2. **Compute Commitment** — Poseidon(secret) computed locally
3. **Fetch Path** — server returns Merkle siblings for your commitment
4. **Prove & Submit** — proof generates locally (~1–3s), submits to server
5. Returns `{ compliant: true }` if identity is in the whitelist

---

## Security Properties

**Zero private data transmission**
Private inputs are used exclusively inside `snarkjs.groth16.fullProve()` in the
browser. They are never included in any network request. Verified by inspecting
the POST payload to `/compliance/check` — it contains only `proof` and
`publicSignals`.

**Replay prevention**
Each proof can be submitted exactly once. A SHA256 nullifier is computed from
`proof.pi_a + ruleId` and stored in Redis after first use. Duplicate submissions
return `500 Proof already used` regardless of proof validity.

**Fail-closed design**
Redis errors in the nullifier registry cause request rejection rather than
allowing the request through. The system fails safely.

**Production endpoint gating**
The server-side `/proof/generate` endpoint (which accepts private inputs) is
only mounted when `NODE_ENV=development`. In production the route does not exist.

---

## Known Limitations

**Single-party trusted setup**
The zkeys were generated in a single-party Powers of Tau ceremony. In a production
deployment a multi-party ceremony with independent participants is required to
ensure no single party can forge proofs. The current setup is appropriate for
demonstration purposes only.

**Merkle tree capacity**
The sanctions_clear circuit is compiled at depth 10 — maximum 1024 leaf slots.
Increasing capacity requires recompiling the circuit and regenerating all keys.

**Root change after registration**
Every new identity registration rebuilds the Merkle tree and changes the root.
Existing proofs reference their generation-time root and remain valid — they are
self-contained. New proofs reference the current root.

**In-memory rate limiter**
The rate limiter resets on server restart and is not shared across multiple
instances. A Redis-backed rate limit store is needed for multi-instance deployments.

---

## Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 20, TypeScript 5.6 |
| Framework | Express 5 |
| ZK Proofs | circom 2.1.6, snarkjs 0.7.6 |
| Hash Function | Poseidon (via circomlibjs 0.1.7) |
| Persistence | Redis (ioredis 5) |
| Validation | Zod |
| Testing | Jest, ts-jest, ioredis-mock |
| Proof System | Groth16 on BN128 curve |