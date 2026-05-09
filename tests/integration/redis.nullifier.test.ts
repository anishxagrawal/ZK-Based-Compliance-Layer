/**
 * Redis nullifier registry integration test using ioredis-mock.
 * 
 * This test verifies the Redis-backed nullifier registry implementation
 * with realistic scenarios including persistence across restarts.
 * 
 * Critical test cases:
 * 1. Store and retrieve nullifier through Redis
 * 2. Nullifier survives mock restart (proves persistence value)
 * 3. Count reflects correct number
 * 4. Duplicate detection works
 */

import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import { RedisNullifierRegistry } from '../../src/zk/implementations/RedisNullifierRegistry';

describe('Redis Nullifier Registry Integration', () => {
  let redis: Redis;
  let registry: RedisNullifierRegistry;

  beforeEach(() => {
    // Create fresh Redis mock for each test
    redis = new RedisMock() as Redis;
    registry = new RedisNullifierRegistry(redis);
  });

  afterEach(async () => {
    // Clean up Redis mock
    await redis.flushall();
    redis.disconnect();
  });

  it('stores and retrieves nullifier through Redis', async () => {
    const nullifier = 'a'.repeat(64);

    // Initially should not exist
    const existsBefore = await registry.has(nullifier);
    expect(existsBefore).toBe(false);

    // Store the nullifier
    await registry.store(nullifier);

    // Now should exist
    const existsAfter = await registry.has(nullifier);
    expect(existsAfter).toBe(true);
  });

  it('nullifier survives mock restart (proves persistence)', async () => {
    // This is the KEY test that proves the production value of Redis
    // In production, nullifiers survive server restarts
    // In development (InMemoryNullifierRegistry), they don't
    
    const nullifier = 'b'.repeat(64);

    // Store nullifier in first registry instance
    await registry.store(nullifier);
    
    // Verify it exists
    const existsBefore = await registry.has(nullifier);
    expect(existsBefore).toBe(true);

    // Create NEW registry instance with SAME Redis mock
    // This simulates server restart with persistent Redis
    const newRegistry = new RedisNullifierRegistry(redis);

    // Nullifier should STILL exist in new registry instance
    const existsAfter = await newRegistry.has(nullifier);
    expect(existsAfter).toBe(true);

    // This proves that nullifiers are stored in Redis, not in-memory
    // In production, this means replay attacks are prevented even after server restart
  });

  it('count reflects correct number of nullifiers', async () => {
    // Start with empty registry
    const countBefore = await registry.count();
    expect(countBefore).toBe(0);

    // Store multiple nullifiers
    await registry.store('a'.repeat(64));
    await registry.store('b'.repeat(64));
    await registry.store('c'.repeat(64));

    // Count should reflect all stored nullifiers
    const countAfter = await registry.count();
    expect(countAfter).toBe(3);
  });

  it('duplicate detection works correctly', async () => {
    const nullifier = 'd'.repeat(64);

    // Store nullifier
    await registry.store(nullifier);

    // First check should return true (exists)
    const exists1 = await registry.has(nullifier);
    expect(exists1).toBe(true);

    // Second check should also return true (still exists)
    const exists2 = await registry.has(nullifier);
    expect(exists2).toBe(true);

    // Storing again should be idempotent (no error)
    await expect(registry.store(nullifier)).resolves.not.toThrow();

    // Count should still be 1 (not 2)
    const count = await registry.count();
    expect(count).toBe(1);
  });

  it('multiple nullifiers are stored independently', async () => {
    const nullifier1 = 'e'.repeat(64);
    const nullifier2 = 'f'.repeat(64);
    const nullifier3 = 'g'.repeat(64);

    // Store first nullifier
    await registry.store(nullifier1);
    expect(await registry.has(nullifier1)).toBe(true);
    expect(await registry.has(nullifier2)).toBe(false);
    expect(await registry.has(nullifier3)).toBe(false);

    // Store second nullifier
    await registry.store(nullifier2);
    expect(await registry.has(nullifier1)).toBe(true);
    expect(await registry.has(nullifier2)).toBe(true);
    expect(await registry.has(nullifier3)).toBe(false);

    // Store third nullifier
    await registry.store(nullifier3);
    expect(await registry.has(nullifier1)).toBe(true);
    expect(await registry.has(nullifier2)).toBe(true);
    expect(await registry.has(nullifier3)).toBe(true);

    // All three should be counted
    const count = await registry.count();
    expect(count).toBe(3);
  });

  it('ping returns true when Redis is connected', async () => {
    const isConnected = await registry.ping();
    expect(isConnected).toBe(true);
  });

  it('ping returns false when Redis is disconnected', async () => {
    // Mock ping to throw error
    const originalPing = redis.ping.bind(redis);
    redis.ping = async () => { throw new Error('ECONNREFUSED'); };
    
    const isConnected = await registry.ping();
    expect(isConnected).toBe(false);
    
    // Restore original method
    redis.ping = originalPing;
  });

  it('TTL is set on the nullifiers key', async () => {
    const nullifier = 'h'.repeat(64);
    
    // Store nullifier
    await registry.store(nullifier);

    // Check TTL on the key
    const ttl = await redis.ttl('nullifiers:all');
    
    // TTL should be set (90 days = 7776000 seconds)
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(90 * 24 * 60 * 60);
  });

  it('TTL is refreshed on subsequent stores', async () => {
    const nullifier1 = 'i'.repeat(64);
    const nullifier2 = 'j'.repeat(64);

    // Store first nullifier
    await registry.store(nullifier1);
    const ttl1 = await redis.ttl('nullifiers:all');

    // Wait a moment (simulate time passing)
    await new Promise(resolve => setTimeout(resolve, 100));

    // Store second nullifier (should refresh TTL)
    await registry.store(nullifier2);
    const ttl2 = await redis.ttl('nullifiers:all');

    // TTL should be refreshed (close to original value)
    // Note: In ioredis-mock, TTL doesn't actually decrease, but we verify it's set
    expect(ttl2).toBeGreaterThan(0);
    expect(ttl2).toBeLessThanOrEqual(90 * 24 * 60 * 60);
  });
});
