# ZK Compliance API - Quick Reference

## What Is This?

A **privacy-preserving compliance verification API** that lets users prove they meet requirements (age, income, clearance) **without revealing their actual private data**.

## Real-World Use Cases

- 🏦 **FinTech**: Prove income >= $50k for loans without revealing salary
- 🎂 **Age Verification**: Prove age >= 18 without revealing birthdate  
- ✅ **KYC/AML**: Prove identity is whitelisted without revealing which identity
- 🏥 **Healthcare**: Prove eligibility without exposing medical records
- 💼 **Employment**: Prove qualifications without revealing full history

## Core Features

### 1. Proof Generation (`POST /proof/generate`)
Generate zero-knowledge proofs from private inputs
- **Input**: Private data (income, age, identity)
- **Output**: Cryptographic proof (no private data revealed)
- **Time**: 30-60 seconds per proof

### 2. Compliance Check (`POST /compliance/check`)
Verify proofs with replay attack prevention
- **Input**: Proof + public signals
- **Output**: `compliant: true/false`
- **Security**: Single-use proofs (nullifier registry)

### 3. Nullifier Management
- Check if proof already used: `GET /compliance/nullifier/{hash}`
- Get total count: `GET /compliance/nullifier/count`

## Implemented Compliance Rules

### 1. Income Threshold (`income_threshold`)
**Proves**: Income >= threshold  
**Private**: Actual income amount  
**Public**: Threshold requirement  
**Use Case**: Loan applications, credit checks

### 2. Age Verification (`age_18`)
**Proves**: Age >= 18  
**Private**: Actual age/birthdate  
**Public**: Age requirement  
**Use Case**: Age-restricted services

### 3. Sanctions Clearance (`sanctions_clear`)
**Proves**: Identity in approved whitelist  
**Private**: Which specific identity  
**Public**: Whitelist version (Merkle root)  
**Use Case**: KYC/AML compliance

## Technology Stack

- **Backend**: Node.js + TypeScript + Express
- **ZK Crypto**: circom + snarkjs (Groth16)
- **Storage**: Redis (persistent nullifier registry)
- **Testing**: Jest (96 tests, all passing)
- **Security**: API key auth, rate limiting, input validation

## Architecture Highlights

```
API Layer (Express)
    ↓
Service Layer (Business Logic)
    ↓
Interface Layer (Contracts)
    ↓
Implementation Layer (ZK, Redis)
```

**Key Patterns**:
- Clean Architecture / Hexagonal Architecture
- Dependency Injection
- Interface Segregation
- Fail-Closed Security

## Security Features

✅ **Replay Attack Prevention** - Redis-backed nullifier registry  
✅ **Rate Limiting** - 100 req/min global, 10 req/min for proof generation  
✅ **API Key Authentication** - Required for all endpoints  
✅ **Input Validation** - Zod schemas on all requests  
✅ **Privacy Guarantees** - Private inputs never logged or stored  
✅ **Fail-Closed** - Errors reject requests (don't allow by default)

## Test Coverage

- **96 tests** across 12 test suites
- **Unit tests**: Service logic, ZK operations
- **API tests**: Endpoint validation
- **Integration tests**: End-to-end with real cryptography
- **Redis tests**: Persistence and replay prevention

## Production Readiness

✅ Redis persistence (survives restarts)  
✅ Health monitoring endpoint  
✅ OpenAPI documentation  
✅ Comprehensive error handling  
✅ Environment configuration  
✅ TypeScript type safety  
✅ 90-day TTL on nullifiers  
✅ Atomic Redis operations

## Example: Loan Application

### Traditional (Privacy Risk)
```
User sends: salary = $75,000
Platform stores: $75,000 in database
Platform checks: $75,000 >= $50,000 ✓
Risk: Platform has sensitive data
```

### Zero-Knowledge (Privacy Preserved)
```
User generates: proof("income >= $50k")
User sends: proof (no salary revealed)
Platform verifies: proof is valid ✓
Platform learns: "meets requirement"
Result: Platform never sees salary
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/proof/generate` | POST | Generate ZK proof |
| `/verify` | POST | Verify proof (crypto only) |
| `/compliance/check` | POST | Verify + replay prevention |
| `/compliance/nullifier/{hash}` | GET | Check if proof used |
| `/compliance/nullifier/count` | GET | Get total count |
| `/health` | GET | Health check |
| `/docs` | GET | OpenAPI spec |

## Running the System

### Development
```bash
npm install
npm run dev
```

### Testing
```bash
npm test  # All 96 tests
```

### Production
```bash
# Set environment variables
REDIS_URL=redis://localhost:6379
API_KEY=your-secret-key

# Start server
npm start
```

## Key Files

- `src/api/app.ts` - Application entry point
- `src/services/ComplianceService.ts` - Compliance logic
- `src/zk/implementations/RedisNullifierRegistry.ts` - Replay prevention
- `circuits/*.circom` - Zero-knowledge circuits
- `src/docs/openapi.yaml` - API documentation

## Interview Highlights

**Problem**: Traditional compliance requires collecting sensitive data  
**Solution**: Zero-knowledge proofs verify compliance without seeing data  
**Impact**: Privacy-preserving verification for fintech, healthcare, identity  

**Technical Achievement**:
- 3 production ZK circuits (circom + Groth16)
- Redis-backed replay prevention
- 96 tests with real cryptography
- Clean architecture with dependency injection

**Production Ready**:
- Rate limiting, health monitoring, error handling
- Redis persistence across restarts
- OpenAPI documentation
- Comprehensive test coverage

---

**Status**: Production-ready privacy-preserving compliance API
