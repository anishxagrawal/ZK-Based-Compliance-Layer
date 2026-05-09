# Client-Side Proof Generation Migration Analysis

## Executive Summary

**Current Architecture**: Server-side proof generation via `POST /proof/generate`  
**Target Architecture**: Client-side (browser) proof generation, server verify-only  
**Overall Difficulty**: **MEDIUM** (3-5 days for experienced engineer)  
**Primary Risk**: WASM file sizes (1.7-1.9 MB) may cause slow initial loads  
**Blocker Risk**: LOW - snarkjs 0.7.6 supports browser usage

---

## 1. File Inventory - What Changes

### 1.1 FILES TO DELETE (3 files)

#### `src/api/routes/proofGenerate.ts`
**Current**: Express route handler for `POST /proof/generate`
- Accepts privateInputs from client
- Calls ProofGenerationService
- Returns proof + publicSignals
- Has stricter rate limiting (10 req/min)

**Change**: **DELETE** - Endpoint no longer needed on server
**Rationale**: Proof generation moves entirely to browser

#### `src/services/ProofGenerationService.ts`
**Current**: Service layer for proof generation
- Resolves ruleId to circuit paths
- Delegates to IProofGenerator
- Returns ProofResult

**Change**: **DELETE** - Service no longer needed on server
**Rationale**: Logic moves to client-side JavaScript module

#### `src/zk/implementations/SnarkjsGenerator.ts`
**Current**: Server-side snarkjs proof generator
- Implements IProofGenerator interface
- Uses snarkjs.groth16.fullProve()
- Reads WASM and zkey from filesystem

**Change**: **DELETE** - Implementation no longer needed on server
**Rationale**: Browser will use snarkjs directly

---

### 1.2 FILES TO MODIFY (6 files)

#### `src/api/app.ts`
**Current**: 
- Imports ProofGenerationService, SnarkjsGenerator
- Creates proofGenerationService instance
- Mounts `/proof/generate` route

**Changes Required**:
```typescript
// REMOVE these imports:
import { ProofGenerationService } from "../services/ProofGenerationService";
import { SnarkjsGenerator } from "../zk/implementations/SnarkjsGenerator";
import { createProofGenerateRouter } from "./routes/proofGenerate";

// REMOVE these instantiations:
const generator = new SnarkjsGenerator();
const proofGenerationService = new ProofGenerationService(generator);

// REMOVE this route:
app.use("/proof/generate", createProofGenerateRouter(proofGenerationService));

// ADD static file serving for circuit artifacts:
app.use("/circuits", express.static(path.join(__dirname, "../../circuits")));
app.use("/keys", express.static(path.join(__dirname, "../../keys")));
```

**Difficulty**: Easy - mechanical deletions + add static serving

---

#### `src/docs/openapi.yaml`
**Current**: Documents `POST /proof/generate` endpoint with full request/response schemas

**Changes Required**:
- Remove entire `/proof/generate` path definition (lines ~30-250)
- Remove "Proof Generation" tag
- Update API description to clarify server is verify-only
- Add note about client-side proof generation requirement

**Difficulty**: Easy - documentation update

---

#### `package.json`
**Current**: Lists snarkjs as server dependency

**Changes Required**:
```json
// OPTIONAL: Move snarkjs to devDependencies if only used for testing
// OR keep in dependencies if you want server-side generation for dev/testing
"devDependencies": {
  "snarkjs": "^0.7.6",  // Move here if removing from server entirely
  ...
}
```

**Difficulty**: Easy - dependency reorganization

---

#### `tests/helpers/testApp.ts`
**Current**: Creates test app with ProofGenerationService

**Changes Required**:
```typescript
// REMOVE these imports:
import { ProofGenerationService } from "../../src/services/ProofGenerationService";
import { SnarkjsGenerator } from "../../src/zk/implementations/SnarkjsGenerator";
import { createProofGenerateRouter } from "../../src/api/routes/proofGenerate";

// REMOVE these instantiations:
const generator = new SnarkjsGenerator();
const proofGenerationService = new ProofGenerationService(generator);

// REMOVE this route:
app.use("/proof/generate", createProofGenerateRouter(proofGenerationService));

// OPTIONALLY ADD static serving for integration tests:
app.use("/circuits", express.static(path.join(__dirname, "../../circuits")));
```

**Difficulty**: Easy - mirror changes from app.ts

---

#### `tsconfig.json`
**Current**: Standard TypeScript config for Node.js

**Changes Required**: 
- No changes needed for server code
- Client-side code will need separate build config (see "New Files" section)

**Difficulty**: N/A - no changes

---

#### `.gitignore` (if exists)
**Current**: May not explicitly list build artifacts

**Changes Required**:
```
# Add client build output
public/js/bundle.js
public/js/bundle.js.map
```

**Difficulty**: Easy - add entries

---

### 1.3 FILES THAT STAY UNTOUCHED (Critical - No Changes)

✅ **All verification logic**:
- `src/zk/interfaces/IProofVerifier.ts` - Interface unchanged
- `src/zk/implementations/SnarkjsVerifier.ts` - Implementation unchanged
- `src/api/routes/verify.ts` - Endpoint unchanged

✅ **All compliance logic**:
- `src/services/ComplianceService.ts` - Unchanged
- `src/api/routes/compliance.ts` - Unchanged
- `src/config/rules.ts` - Unchanged

✅ **All nullifier/replay prevention**:
- `src/zk/interfaces/INullifierRegistry.ts` - Unchanged
- `src/zk/implementations/RedisNullifierRegistry.ts` - Unchanged
- `src/zk/implementations/InMemoryNullifierRegistry.ts` - Unchanged
- `src/utils/nullifier.ts` - Unchanged

✅ **All infrastructure**:
- Redis configuration - Unchanged
- Rate limiting - Unchanged (still applies to /compliance/check)
- API key authentication - Unchanged
- Health monitoring - Unchanged

✅ **All circuit files**:
- `circuits/*.circom` - Source circuits unchanged
- `circuits/*_js/*.wasm` - Compiled WASM unchanged
- `*.zkey` files - Proving keys unchanged
- `src/keys/*_vkey.json` - Verification keys unchanged

**Confidence Level**: HIGH - Core backend functionality completely isolated from proof generation

---

## 2. New Files to Create

### 2.1 Client-Side Proof Generation Module

#### `public/js/zkProofGenerator.js` (or `.ts` if using TypeScript)
**Purpose**: Browser-compatible proof generation module

**Contents**:
```javascript
// Import snarkjs for browser (from CDN or bundled)
import * as snarkjs from 'snarkjs';

// Circuit artifact URLs
const CIRCUITS = {
  age_18: {
    wasm: '/circuits/age_check_js/age_check.wasm',
    zkey: '/age_check_0.zkey'
  },
  income_threshold: {
    wasm: '/circuits/income_threshold_js/income_threshold.wasm',
    zkey: '/income_threshold_0.zkey'
  },
  sanctions_clear: {
    wasm: '/circuits/sanctions_clear_js/sanctions_clear.wasm',
    zkey: '/sanctions_clear_0.zkey'
  }
};

/**
 * Generate a zero-knowledge proof in the browser
 * @param {string} ruleId - Compliance rule identifier
 * @param {object} privateInputs - Private inputs (never leave browser)
 * @returns {Promise<{proof, publicSignals}>}
 */
export async function generateProof(ruleId, privateInputs) {
  const circuit = CIRCUITS[ruleId];
  if (!circuit) {
    throw new Error(`Unknown ruleId: ${ruleId}`);
  }

  // Download WASM and zkey (browser caches these)
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    privateInputs,
    circuit.wasm,
    circuit.zkey
  );

  return { proof, publicSignals };
}
```

**Difficulty**: Medium - requires understanding snarkjs browser API

---

### 2.2 Example HTML Page

#### `public/index.html`
**Purpose**: Demo page showing client-side proof generation

**Contents**:
```html
<!DOCTYPE html>
<html>
<head>
  <title>ZK Compliance - Client-Side Proof Generation</title>
  <script type="module" src="/js/zkProofGenerator.js"></script>
</head>
<body>
  <h1>Generate Proof (Client-Side)</h1>
  
  <form id="proofForm">
    <label>Rule:</label>
    <select id="ruleId">
      <option value="age_18">Age 18+</option>
      <option value="income_threshold">Income Threshold</option>
      <option value="sanctions_clear">Sanctions Clear</option>
    </select>
    
    <label>Private Inputs (JSON):</label>
    <textarea id="privateInputs" rows="10"></textarea>
    
    <button type="submit">Generate Proof</button>
  </form>
  
  <div id="result"></div>
  
  <script type="module">
    import { generateProof } from '/js/zkProofGenerator.js';
    
    document.getElementById('proofForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const ruleId = document.getElementById('ruleId').value;
      const privateInputs = JSON.parse(document.getElementById('privateInputs').value);
      
      document.getElementById('result').textContent = 'Generating proof... (30-60s)';
      
      try {
        const { proof, publicSignals } = await generateProof(ruleId, privateInputs);
        
        // Now submit to server for verification
        const response = await fetch('/compliance/check', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'YOUR_API_KEY'
          },
          body: JSON.stringify({ ruleId, proof, publicSignals })
        });
        
        const result = await response.json();
        document.getElementById('result').textContent = JSON.stringify(result, null, 2);
      } catch (error) {
        document.getElementById('result').textContent = `Error: ${error.message}`;
      }
    });
  </script>
</body>
</html>
```

**Difficulty**: Easy - standard HTML/JS

---

### 2.3 Build Configuration (if using bundler)

#### `webpack.config.js` or `rollup.config.js`
**Purpose**: Bundle client-side code for browser

**Why Needed**: 
- snarkjs has Node.js dependencies that need polyfills for browser
- Bundle size optimization
- ES modules compatibility

**Difficulty**: Medium - requires build tool configuration

---

### 2.4 Client-Side Documentation

#### `public/README.md` or update main README
**Purpose**: Document how to use client-side proof generation

**Contents**:
- How to include zkProofGenerator.js
- Example code snippets
- Browser compatibility notes
- Performance expectations (30-60s for proof generation)
- File size warnings (initial load downloads 2-3 MB)

**Difficulty**: Easy - documentation

---

## 3. Circuit Artifacts - Readiness Assessment

### 3.1 WASM Files (✅ ALL PRESENT)

| Circuit | File | Size | Status |
|---------|------|------|--------|
| age_18 | `circuits/age_check_js/age_check.wasm` | 36 KB | ✅ Ready |
| income_threshold | `circuits/income_threshold_js/income_threshold.wasm` | 1.7 MB | ✅ Ready |
| sanctions_clear | `circuits/sanctions_clear_js/sanctions_clear.wasm` | 1.9 MB | ✅ Ready |

**Assessment**: All WASM files exist and are in correct locations for serving.

---

### 3.2 Proving Keys (zkey files) (✅ ALL PRESENT)

| Circuit | File | Size | Status |
|---------|------|------|--------|
| age_18 | `age_check_0.zkey` | 10 KB | ✅ Ready |
| income_threshold | `income_threshold_0.zkey` | 270 KB | ✅ Ready |
| sanctions_clear | `sanctions_clear_0.zkey` | 2.45 MB | ✅ Ready |

**Assessment**: All zkey files exist in project root. Can be served as-is.

---

### 3.3 Verification Keys (✅ ALL PRESENT)

| Circuit | File | Status |
|---------|------|--------|
| age_18 | `src/keys/verification_key.json` | ✅ Ready |
| income_threshold | `src/keys/income_threshold_vkey.json` | ✅ Ready |
| sanctions_clear | `src/keys/sanctions_clear_vkey.json` | ✅ Ready |

**Assessment**: All verification keys exist. Server already uses these - no changes needed.

---

### 3.4 Total Download Size per Circuit

| Circuit | WASM + zkey | First Load Time (3G) | First Load Time (4G) |
|---------|-------------|----------------------|----------------------|
| age_18 | 46 KB | <1 second | <1 second |
| income_threshold | 1.97 MB | ~5 seconds | ~2 seconds |
| sanctions_clear | 4.35 MB | ~11 seconds | ~4 seconds |

**Assessment**: 
- ✅ age_18 is lightweight and fast
- ⚠️ income_threshold is acceptable but noticeable
- ⚠️ sanctions_clear is large - consider lazy loading or warning users

**Recommendation**: Implement browser caching headers and consider service worker for offline capability.

---

## 4. Difficulty Assessment by Chunk

### Chunk 1: Remove Server-Side Proof Generation
**Tasks**:
- Delete 3 files (proofGenerate.ts, ProofGenerationService.ts, SnarkjsGenerator.ts)
- Remove imports/instantiations from app.ts
- Remove route mounting

**Difficulty**: ⭐ EASY  
**Time Estimate**: 30 minutes  
**Risk**: LOW - clean deletions, no side effects

---

### Chunk 2: Add Static File Serving
**Tasks**:
- Add express.static for /circuits and /keys routes
- Configure CORS if needed
- Set cache headers for WASM/zkey files

**Difficulty**: ⭐ EASY  
**Time Estimate**: 1 hour  
**Risk**: LOW - standard Express feature

---

### Chunk 3: Create Client-Side Proof Generator
**Tasks**:
- Write zkProofGenerator.js module
- Handle snarkjs browser imports
- Implement error handling
- Test with all three circuits

**Difficulty**: ⭐⭐ MEDIUM  
**Time Estimate**: 4-6 hours  
**Risk**: MEDIUM - snarkjs browser API may have quirks

---

### Chunk 4: Build System Setup (Optional but Recommended)
**Tasks**:
- Configure webpack/rollup for browser bundle
- Add polyfills for Node.js APIs
- Optimize bundle size
- Set up source maps

**Difficulty**: ⭐⭐ MEDIUM  
**Time Estimate**: 3-4 hours  
**Risk**: MEDIUM - build tool configuration can be finicky

---

### Chunk 5: Create Demo HTML Page
**Tasks**:
- Build example UI
- Add form validation
- Show loading states
- Display results

**Difficulty**: ⭐ EASY  
**Time Estimate**: 2-3 hours  
**Risk**: LOW - standard web development

---

### Chunk 6: Update Tests
**Tasks**:
- Delete/modify 3 test files (ProofGenerationService.test.ts, proofGenerate.test.ts, proofGenerate.real.test.ts)
- Update testApp.ts
- Verify remaining 75 tests still pass

**Difficulty**: ⭐⭐ MEDIUM  
**Time Estimate**: 2-3 hours  
**Risk**: MEDIUM - need to ensure no cascading test failures

---

### Chunk 7: Update Documentation
**Tasks**:
- Update OpenAPI spec
- Update README
- Add client-side usage guide
- Update PROJECT_OVERVIEW.md

**Difficulty**: ⭐ EASY  
**Time Estimate**: 2 hours  
**Risk**: LOW - documentation only

---

### **OVERALL DIFFICULTY**: ⭐⭐ MEDIUM
### **TOTAL TIME ESTIMATE**: 3-5 days for experienced engineer
### **RISK LEVEL**: LOW-MEDIUM

---

## 5. Risks and Blockers

### 5.1 snarkjs Browser Compatibility ✅ LOW RISK

**Current Version**: snarkjs 0.7.6

**Browser Support**: 
- ✅ snarkjs 0.7.x officially supports browser usage
- ✅ Provides ES modules and UMD builds
- ✅ WASM support is built-in
- ✅ No known blockers

**Evidence**: 
- snarkjs documentation explicitly covers browser usage
- Widely used in production browser apps (e.g., Tornado Cash, Semaphore)
- Active maintenance and browser bug fixes

**Mitigation**: None needed - this is well-trodden path

---

### 5.2 File Sizes ⚠️ MEDIUM RISK

**Issue**: Large WASM/zkey files cause slow initial loads

**Specific Concerns**:
- sanctions_clear: 4.35 MB total (WASM 1.9 MB + zkey 2.45 MB)
- income_threshold: 1.97 MB total (WASM 1.7 MB + zkey 270 KB)

**Impact**:
- First load on 3G: 5-11 seconds download time
- Users on slow connections may abandon
- Mobile data usage concerns

**Mitigations**:
1. **Browser Caching** (HIGH PRIORITY)
   - Set aggressive cache headers (1 year)
   - Use service worker for offline capability
   - Files only downloaded once

2. **Lazy Loading** (RECOMMENDED)
   - Only download circuit files when user selects that rule
   - Show file size warning before download
   - Implement progress indicator

3. **CDN** (OPTIONAL)
   - Serve static files from CDN for faster global delivery
   - Reduce server bandwidth costs

4. **Compression** (STANDARD)
   - Enable gzip/brotli compression on server
   - Can reduce transfer size by 20-30%

**Risk Level**: MEDIUM - manageable with proper UX

---

### 5.3 CORS Configuration ⚠️ LOW RISK

**Issue**: If frontend and API are on different domains, CORS must be configured

**Current State**: 
- No CORS middleware in app.ts
- Assumes same-origin deployment

**Required If**:
- Frontend served from different domain (e.g., app.example.com vs api.example.com)
- Using CDN for static files

**Mitigation**:
```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
```

**Risk Level**: LOW - standard Express middleware

---

### 5.4 Test Suite Impact ⚠️ MEDIUM RISK

**Current Test Count**: 96 tests across 12 suites

**Tests That Break/Become Irrelevant**:

1. **`tests/services/ProofGenerationService.test.ts`** (6 tests)
   - Status: DELETE ENTIRE FILE
   - Reason: Service no longer exists

2. **`tests/api/proofGenerate.test.ts`** (7 tests)
   - Status: DELETE ENTIRE FILE
   - Reason: Endpoint no longer exists

3. **`tests/integration/proofGenerate.real.test.ts`** (8 tests)
   - Status: DELETE ENTIRE FILE
   - Reason: Server-side generation no longer exists

**Total Tests Removed**: 21 tests

**Remaining Tests**: 75 tests (79% of original suite)

**Tests That Stay Valid**:
- ✅ All verification tests (verify.test.ts, verify.real.test.ts)
- ✅ All compliance tests (ComplianceService.test.ts, compliance tests)
- ✅ All nullifier tests (nullifier.test.ts, nullifier.real.test.ts, redis tests)
- ✅ All integration tests for /compliance/check endpoint

**New Tests Needed**:
- Client-side proof generation (would be browser tests, not Jest)
- Static file serving (simple Express tests)

**Risk Level**: MEDIUM - significant test deletion, but remaining tests cover core functionality

---

### 5.5 Development Workflow Impact ⚠️ LOW RISK

**Issue**: Developers lose convenient server-side proof generation for testing

**Current Workflow**:
```bash
# Easy: POST to /proof/generate with privateInputs
curl -X POST http://localhost:3000/proof/generate \
  -H "x-api-key: $API_KEY" \
  -d '{"ruleId": "age_18", "privateInputs": {"age": "25", "threshold": "18"}}'
```

**New Workflow**:
```bash
# Must use browser or write custom script
# OR keep server-side generation as dev-only endpoint
```

**Mitigation Options**:

1. **Keep /proof/generate as dev-only** (RECOMMENDED)
   - Add environment check: `if (process.env.NODE_ENV === 'development')`
   - Mount route only in dev mode
   - Document as "testing utility only"

2. **Create CLI tool**
   - Separate script for generating proofs
   - Uses snarkjs directly
   - Not exposed via API

3. **Use browser for all testing**
   - More realistic testing
   - Slower developer feedback loop

**Risk Level**: LOW - multiple mitigation options

---

### 5.6 Backward Compatibility ⚠️ HIGH RISK (if applicable)

**Issue**: Existing clients using `POST /proof/generate` will break

**Questions to Answer**:
- Are there external clients using this API?
- Is this a public API or internal only?
- What is the deprecation/migration timeline?

**If External Clients Exist**:
1. **Deprecation Period** (REQUIRED)
   - Keep endpoint for 3-6 months
   - Add deprecation warning in response headers
   - Update documentation with migration guide

2. **Versioning** (RECOMMENDED)
   - Create /v2 API without proof generation
   - Keep /v1 with proof generation
   - Sunset /v1 after migration period

3. **Client Migration Support**
   - Provide example client-side code
   - Offer migration assistance
   - Monitor usage metrics

**If Internal Only**:
- Coordinate with all teams
- Update all clients simultaneously
- No backward compatibility needed

**Risk Level**: HIGH if external clients exist, LOW if internal only

---

## 6. What Stays Completely Untouched

### 6.1 Core Backend Functionality (100% Unchanged)

✅ **Verification System**
- `IProofVerifier` interface
- `SnarkjsVerifier` implementation
- `POST /verify` endpoint
- All verification keys in `src/keys/`

✅ **Compliance System**
- `ComplianceService` class
- `POST /compliance/check` endpoint
- Rule configuration in `src/config/rules.ts`
- All compliance logic and validation

✅ **Nullifier Registry / Replay Prevention**
- `INullifierRegistry` interface
- `RedisNullifierRegistry` implementation
- `InMemoryNullifierRegistry` implementation
- `GET /compliance/nullifier/{hash}` endpoint
- `GET /compliance/nullifier/count` endpoint
- Redis configuration and connection
- 90-day TTL logic
- Atomic operations

✅ **Security Infrastructure**
- API key authentication (`authMiddleware`)
- Rate limiting (`apiRateLimiter`)
- Global rate limit (100 req/min)
- Compliance endpoint rate limit
- Input validation (Zod schemas)
- Error handling

✅ **Monitoring & Operations**
- `GET /health` endpoint
- Redis connection monitoring
- Health status reporting
- Logging infrastructure

✅ **Circuit Artifacts**
- All `.circom` source files
- All compiled `.wasm` files
- All `.zkey` proving keys
- All `.r1cs` constraint files
- All verification keys

✅ **Type Definitions**
- `src/types/proof.ts`
- All interface definitions
- TypeScript configuration

✅ **Utilities**
- `src/utils/nullifier.ts` (nullifier computation)
- All helper functions

---

### 6.2 Test Files That Stay Valid (75 tests)

✅ **Verification Tests**
- `tests/zk/SnarkjsVerifier.test.ts`
- `tests/api/verify.test.ts`
- `tests/integration/verify.real.test.ts`

✅ **Compliance Tests**
- `tests/services/ComplianceService.test.ts`
- `tests/integration/income_threshold.real.test.ts`
- `tests/integration/sanctions.real.test.ts`

✅ **Nullifier Tests**
- `tests/utils/nullifier.test.ts`
- `tests/integration/nullifier.real.test.ts`
- `tests/zk/RedisNullifierRegistry.test.ts`
- `tests/integration/redis.nullifier.test.ts`

✅ **Infrastructure Tests**
- All middleware tests
- All validation tests
- All error handling tests

---

## 7. Migration Checklist

### Phase 1: Preparation (Day 1)
- [ ] Review snarkjs browser documentation
- [ ] Test snarkjs in browser console with sample circuit
- [ ] Decide on build tool (webpack vs rollup vs none)
- [ ] Plan static file serving strategy
- [ ] Identify if external clients exist (backward compatibility)

### Phase 2: Server Changes (Day 1-2)
- [ ] Add static file serving for /circuits and /keys
- [ ] Configure cache headers (1 year for immutable files)
- [ ] Test static file access in browser
- [ ] Remove proof generation route from app.ts
- [ ] Remove proof generation service instantiation
- [ ] Delete ProofGenerationService.ts
- [ ] Delete SnarkjsGenerator.ts
- [ ] Delete proofGenerate.ts route
- [ ] Update testApp.ts (remove proof generation)

### Phase 3: Client-Side Implementation (Day 2-3)
- [ ] Create public/ directory structure
- [ ] Write zkProofGenerator.js module
- [ ] Test with age_18 circuit (smallest, fastest)
- [ ] Test with income_threshold circuit
- [ ] Test with sanctions_clear circuit
- [ ] Implement error handling
- [ ] Add loading indicators
- [ ] Create example HTML page

### Phase 4: Build System (Day 3-4, Optional)
- [ ] Set up webpack/rollup config
- [ ] Add Node.js polyfills if needed
- [ ] Configure source maps
- [ ] Optimize bundle size
- [ ] Test bundled output in browser

### Phase 5: Testing (Day 4)
- [ ] Delete proof generation test files (3 files, 21 tests)
- [ ] Run remaining test suite (expect 75 passing)
- [ ] Fix any broken tests
- [ ] Add static file serving tests
- [ ] Manual browser testing of all circuits

### Phase 6: Documentation (Day 5)
- [ ] Update OpenAPI spec (remove /proof/generate)
- [ ] Update README with client-side instructions
- [ ] Create client-side usage guide
- [ ] Update PROJECT_OVERVIEW.md
- [ ] Add performance expectations (30-60s proof time)
- [ ] Document file size warnings

### Phase 7: Deployment (Day 5)
- [ ] Deploy server changes
- [ ] Deploy static files
- [ ] Configure CDN (if using)
- [ ] Monitor error rates
- [ ] Verify browser caching works
- [ ] Test on multiple browsers

---

## 8. Recommended Approach

### Option A: Full Migration (Recommended for Production)
**Timeline**: 5 days  
**Outcome**: Server is verify-only, all proof generation in browser  
**Best For**: Production deployment, maximum privacy

### Option B: Hybrid Approach (Recommended for Transition)
**Timeline**: 3 days  
**Outcome**: Client-side generation primary, server-side kept as dev utility  
**Implementation**:
```typescript
// Keep /proof/generate but only in development
if (process.env.NODE_ENV === 'development') {
  app.use("/proof/generate", createProofGenerateRouter(proofGenerationService));
}
```
**Best For**: Gradual migration, maintaining dev workflow

### Option C: Parallel Deployment
**Timeline**: 6 days  
**Outcome**: Both client and server generation available  
**Best For**: Backward compatibility during migration period

---

## 9. Success Criteria

✅ **Functional**
- [ ] All three circuits generate proofs in browser
- [ ] Proofs verify successfully via /compliance/check
- [ ] Static files served with proper caching
- [ ] 75 remaining tests pass

✅ **Performance**
- [ ] age_18 proof generation: <5 seconds
- [ ] income_threshold proof generation: <60 seconds
- [ ] sanctions_clear proof generation: <90 seconds
- [ ] WASM/zkey files cached after first load

✅ **Security**
- [ ] Private inputs never sent to server
- [ ] All verification logic unchanged
- [ ] Replay prevention still works
- [ ] Rate limiting still enforced

✅ **Documentation**
- [ ] OpenAPI spec updated
- [ ] Client-side usage guide created
- [ ] Example code provided
- [ ] Performance expectations documented

---

## 10. Final Recommendation

**Proceed with Migration**: YES, with MEDIUM difficulty rating

**Rationale**:
1. ✅ All circuit artifacts ready (WASM, zkey files exist)
2. ✅ snarkjs 0.7.6 supports browser usage (no blockers)
3. ✅ Core backend completely isolated (no risk to verification/compliance)
4. ⚠️ File sizes manageable with proper caching and UX
5. ✅ Test suite impact acceptable (75/96 tests remain valid)

**Recommended Path**: Option B (Hybrid Approach)
- Implement client-side generation as primary method
- Keep server-side generation as dev-only utility
- Provides safety net during transition
- Maintains developer workflow

**Timeline**: 3-5 days for experienced engineer familiar with codebase

**Biggest Risk**: File size UX (mitigated with caching + loading indicators)

**Biggest Benefit**: True zero-knowledge architecture - private data never leaves user's device
