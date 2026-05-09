/**
 * Unit tests for RedisNullifierRegistry using ioredis-mock.
 * 
 * These tests verify the Redis-backed nullifier registry implementation
 * without requiring a real Redis server.
 */

import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import { RedisNullifierRegistry } from '../../src/zk/implementations/RedisNullifierRegistry';

describe('RedisNullifierRegistry', () => {
  let redis: Redis;
  let registry: RedisNullifierRegistry;

  beforeEach(() => {
    // Create fresh Redis mock for each test
    redis = new RedisMock();
    registry = new RedisNullifierRegistry(redis as any);
  });

  afterEach(async () => {
    // Clean up Redis mock
    await redis.flushall();
    redis.disconnect();
  });

  describe('has()', () => {
    it('returns false for non-existent nullifier', async () => {
      const nullifier = 'a'.repeat(64);
      const exists = await registry.has(nullifier);
      expect(exists).toBe(false);
    });

    it('returns true for existing nullifier', async () => {
      const nullifier = 'b'.repeat(64);
      await registry.store(nullifier);
      const exists = await registry.has(nullifier);
      expect(exists).toBe(true);
    });

    it('throws error when Redis operation fails', async () => {
      const nullifier = 'c'.repeat(64);
      
      // Mock sismember to throw error
      const originalSismember = redis.sismember.bind(redis);
      redis.sismember = async () => { throw new Error('ECONNREFUSED'); };
      
      await expect(registry.has(nullifier)).rejects.toThrow('Nullifier registry unavailable');
      
      // Restore original method
      redis.sismember = originalSismember;
    });
  });

  describe('store()', () => {
    it('stores a new nullifier', async () => {
      const nullifier = 'd'.repeat(64);
      await registry.store(nullifier);
      
      const exists = await registry.has(nullifier);
      expect(exists).toBe(true);
    });

    it('is idempotent (storing same nullifier twice is safe)', async () => {
      const nullifier = 'e'.repeat(64);
      await registry.store(nullifier);
      await registry.store(nullifier);
      
      const count = await registry.count();
      expect(count).toBe(1);
    });

    it('sets TTL on the Redis key', async () => {
      const nullifier = 'f'.repeat(64);
      await registry.store(nullifier);
      
      // Check that TTL is set (should be 90 days = 7776000 seconds)
      const ttl = await redis.ttl('nullifiers:all');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(90 * 24 * 60 * 60);
    });

    it('throws error when Redis operation fails', async () => {
      const nullifier = 'g'.repeat(64);
      
      // Mock sadd to throw error
      const originalSadd = redis.sadd.bind(redis);
      redis.sadd = async () => { throw new Error('ECONNREFUSED'); };
      
      await expect(registry.store(nullifier)).rejects.toThrow('Nullifier registry unavailable');
      
      // Restore original method
      redis.sadd = originalSadd;
    });
  });

  describe('count()', () => {
    it('returns 0 for empty registry', async () => {
      const count = await registry.count();
      expect(count).toBe(0);
    });

    it('returns correct count after storing nullifiers', async () => {
      await registry.store('a'.repeat(64));
      await registry.store('b'.repeat(64));
      await registry.store('c'.repeat(64));
      
      const count = await registry.count();
      expect(count).toBe(3);
    });

    it('returns 0 when Redis operation fails', async () => {
      await registry.store('a'.repeat(64));
      
      // Mock scard to throw error
      const originalScard = redis.scard.bind(redis);
      redis.scard = async () => { throw new Error('ECONNREFUSED'); };
      
      const count = await registry.count();
      expect(count).toBe(0);
      
      // Restore original method
      redis.scard = originalScard;
    });
  });

  describe('ping()', () => {
    it('returns true when Redis is connected', async () => {
      const isConnected = await registry.ping();
      expect(isConnected).toBe(true);
    });

    it('returns false when Redis is disconnected', async () => {
      // Mock ping to throw error
      const originalPing = redis.ping.bind(redis);
      redis.ping = async () => { throw new Error('ECONNREFUSED'); };
      
      const isConnected = await registry.ping();
      expect(isConnected).toBe(false);
      
      // Restore original method
      redis.ping = originalPing;
    });
  });
});
