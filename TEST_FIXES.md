# Test Fixes for ioredis-mock Connection Failures

## Problem
Four tests were failing because ioredis-mock does not simulate real network connection failures. Calling `redis.disconnect()` on ioredis-mock has no effect — operations continue to work normally.

## Solution
Instead of disconnecting, mock the specific Redis methods to throw errors.

## Fixed Tests

### 1. tests/zk/RedisNullifierRegistry.test.ts

#### Test: "has() throws error when Redis operation fails"
**Before**:
```typescript
await redis.disconnect();
await expect(registry.has(nullifier)).rejects.toThrow('Nullifier registry unavailable');
```

**After**:
```typescript
const originalSismember = redis.sismember.bind(redis);
redis.sismember = async () => { throw new Error('ECONNREFUSED'); };
await expect(registry.has(nullifier)).rejects.toThrow('Nullifier registry unavailable');
redis.sismember = originalSismember; // restore
```

#### Test: "store() throws error when Redis operation fails"
**Before**:
```typescript
await redis.disconnect();
await expect(registry.store(nullifier)).rejects.toThrow('Nullifier registry unavailable');
```

**After**:
```typescript
const originalSadd = redis.sadd.bind(redis);
redis.sadd = async () => { throw new Error('ECONNREFUSED'); };
await expect(registry.store(nullifier)).rejects.toThrow('Nullifier registry unavailable');
redis.sadd = originalSadd; // restore
```

#### Test: "count() returns 0 when Redis operation fails"
**Before**:
```typescript
await redis.disconnect();
const count = await registry.count();
expect(count).toBe(0);
```

**After**:
```typescript
const originalScard = redis.scard.bind(redis);
redis.scard = async () => { throw new Error('ECONNREFUSED'); };
const count = await registry.count();
expect(count).toBe(0);
redis.scard = originalScard; // restore
```

#### Test: "ping() returns false when Redis is disconnected"
**Before**:
```typescript
await redis.disconnect();
const isConnected = await registry.ping();
expect(isConnected).toBe(false);
```

**After**:
```typescript
const originalPing = redis.ping.bind(redis);
redis.ping = async () => { throw new Error('ECONNREFUSED'); };
const isConnected = await registry.ping();
expect(isConnected).toBe(false);
redis.ping = originalPing; // restore
```

### 2. tests/integration/redis.nullifier.test.ts

#### Test: "ping returns false when Redis is disconnected"
**Before**:
```typescript
await redis.disconnect();
const isConnected = await registry.ping();
expect(isConnected).toBe(false);
```

**After**:
```typescript
const originalPing = redis.ping.bind(redis);
redis.ping = async () => { throw new Error('ECONNREFUSED'); };
const isConnected = await registry.ping();
expect(isConnected).toBe(false);
redis.ping = originalPing; // restore
```

## Why This Works

1. **ioredis-mock limitation**: It doesn't simulate network failures because it has no real network connection
2. **Method mocking**: By replacing the method with one that throws, we simulate the error condition
3. **Proper cleanup**: We restore the original method after each test to avoid affecting other tests
4. **Realistic errors**: Using 'ECONNREFUSED' mimics real Redis connection failures

## Test Results

**Expected after fix**:
- Total test suites: 12
- Total tests: 96 (75 original + 9 unit + 9 integration + 3 additional)
- All passing: ✅

## Files Modified
- `tests/zk/RedisNullifierRegistry.test.ts` (3 tests fixed)
- `tests/integration/redis.nullifier.test.ts` (1 test fixed)

## No Implementation Changes
- `src/zk/implementations/RedisNullifierRegistry.ts` - unchanged
- `src/zk/implementations/InMemoryNullifierRegistry.ts` - unchanged
- All other files - unchanged

## Running Tests

From WSL terminal:
```bash
cd ~/zk-project
npm test
```

Expected output:
```
Test Suites: 12 passed, 12 total
Tests:       96 passed, 96 total
```
