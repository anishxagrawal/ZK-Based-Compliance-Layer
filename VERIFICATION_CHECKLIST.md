# Redis Implementation Verification Checklist

Run these commands from your WSL terminal to verify the implementation:

## 1. Navigate to Project
```bash
cd ~/zk-project
```

## 2. Install Dependencies
```bash
npm install
```

**Expected output**: 
- ioredis and ioredis-mock should install successfully
- No errors (warnings about UNC paths are okay)

**Verify**:
```bash
npm list ioredis ioredis-mock
```

Should show:
- `ioredis@5.3.2` (or similar)
- `ioredis-mock@8.9.0` (or similar)

## 3. Run All Tests
```bash
npm test
```

**Expected output**:
```
Test Suites: 12 passed, 12 total
Tests:       84 passed, 84 total
```

Breakdown:
- 75 existing tests (from previous work)
- 9 new RedisNullifierRegistry unit tests
- 9 new Redis integration tests (redis.nullifier.test.ts)
- All integration tests updated to use testApp

## 4. Run Redis Integration Test (Verbose)
```bash
npx jest tests/integration/redis.nullifier.test.ts --forceExit --verbose
```

**Expected output**: All 9 tests passing, including:
- ✅ stores and retrieves nullifier through Redis
- ✅ **nullifier survives mock restart (proves persistence)** ← KEY TEST
- ✅ count reflects correct number of nullifiers
- ✅ duplicate detection works correctly
- ✅ multiple nullifiers are stored independently
- ✅ ping returns true when Redis is connected
- ✅ ping returns false when Redis is disconnected
- ✅ TTL is set on the nullifiers key
- ✅ TTL is refreshed on subsequent stores

## 5. Run Redis Unit Tests
```bash
npx jest tests/zk/RedisNullifierRegistry.test.ts --forceExit --verbose
```

**Expected output**: All 9 tests passing:
- ✅ has() returns false for non-existent nullifier
- ✅ has() returns true for existing nullifier
- ✅ has() throws error when Redis operation fails
- ✅ store() stores a new nullifier
- ✅ store() is idempotent
- ✅ store() sets TTL on the Redis key
- ✅ store() throws error when Redis operation fails
- ✅ count() returns 0 for empty registry
- ✅ count() returns correct count after storing nullifiers
- ✅ count() returns 0 when Redis operation fails
- ✅ ping() returns true when Redis is connected
- ✅ ping() returns false when Redis is disconnected

## 6. Verify TypeScript Compilation
```bash
npm run build
```

**Expected output**: 
- No TypeScript errors
- Compiled files in `dist/` directory

## 7. Check File Structure

Verify these files exist:

### New Implementation Files
```bash
ls -la src/zk/implementations/RedisNullifierRegistry.ts
ls -la tests/zk/RedisNullifierRegistry.test.ts
ls -la tests/integration/redis.nullifier.test.ts
ls -la tests/helpers/testApp.ts
ls -la .env.example
```

### Modified Files
```bash
git status
```

Should show modifications to:
- `package.json`
- `src/api/app.ts`
- All 5 integration test files

## 8. Test Health Endpoint (Optional)

If you want to test the health endpoint with the test app:

```bash
# Create a simple test script
cat > test-health.js << 'EOF'
const { testApp } = require('./tests/helpers/testApp');
const request = require('supertest');

request(testApp)
  .get('/health')
  .then(res => {
    console.log('Health endpoint response:', JSON.stringify(res.body, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
EOF

# Run it
node test-health.js

# Clean up
rm test-health.js
```

**Expected output**:
```json
{
  "ok": true
}
```

(Note: testApp uses InMemoryNullifierRegistry, so no Redis status)

## Success Criteria

✅ All 84 tests pass
✅ No TypeScript compilation errors
✅ ioredis and ioredis-mock installed
✅ "nullifier survives mock restart" test passes
✅ All files created and modified as expected

## If Tests Fail

### Common Issues:

1. **"Cannot find module 'ioredis'"**
   - Solution: Run `npm install` from WSL terminal

2. **"Cannot use namespace 'RedisMock' as a type"**
   - Solution: Already fixed in `tests/zk/RedisNullifierRegistry.test.ts`
   - Verify the import uses `import type Redis from 'ioredis'`

3. **"UNC paths are not supported"**
   - Solution: Make sure you're running from WSL terminal, not Windows PowerShell
   - Use `cd ~/zk-project` not Windows paths

4. **Tests timeout**
   - Solution: Some ZK tests take 30-60 seconds, this is normal
   - The `--runInBand` flag in package.json prevents parallel execution

## Next Steps After Verification

1. ✅ Commit changes to git
2. ✅ Update documentation
3. ✅ Deploy to staging with Redis
4. ✅ Monitor health endpoint
5. ✅ Deploy to production

---

**Status**: Ready for verification from WSL terminal
