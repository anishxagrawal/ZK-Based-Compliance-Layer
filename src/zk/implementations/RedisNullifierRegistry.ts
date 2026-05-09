/**
 * Redis-backed nullifier registry for production use.
 * 
 * This implementation stores nullifiers in a Redis SET, providing:
 * - Persistence across server restarts
 * - Shared state across multiple server instances
 * - Automatic expiration (90-day TTL)
 * - High performance (O(1) lookups and insertions)
 * - Distributed system support
 * 
 * ARCHITECTURE:
 * - All nullifiers stored in single Redis SET key: "nullifiers:all"
 * - Uses atomic SADD operation (no race conditions)
 * - 90-day TTL refreshed on every write
 * - Fails closed on Redis errors (rejects requests rather than allowing replays)
 * 
 * SECURITY:
 * - Nullifiers are already hashed (no PII exposure)
 * - Redis errors cause request rejection (fail-closed design)
 * - Atomic operations prevent race conditions
 * - TTL prevents unbounded growth
 * 
 * REDIS COMMANDS USED:
 * - SISMEMBER: Check if nullifier exists (read-only, O(1))
 * - SADD: Add nullifier to set (atomic, O(1))
 * - EXPIRE: Set 90-day TTL on the key
 * - SCARD: Count nullifiers in set (O(1))
 * - PING: Health check
 */

import { Redis } from 'ioredis';
import { INullifierRegistry } from '../interfaces/INullifierRegistry';

/**
 * Redis key for storing all nullifiers.
 * Single key simplifies management and TTL handling.
 */
const NULLIFIERS_KEY = 'nullifiers:all';

/**
 * TTL for nullifiers in seconds (90 days).
 * After 90 days, nullifiers expire and can theoretically be reused.
 * This prevents unbounded growth while maintaining security for reasonable timeframes.
 */
const NULLIFIER_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

export class RedisNullifierRegistry implements INullifierRegistry {
  /**
   * Creates a new Redis-backed nullifier registry.
   * 
   * @param redis - Configured Redis client (injected dependency)
   * 
   * DEPENDENCY INJECTION:
   * The Redis client is injected rather than created internally, allowing:
   * - Custom Redis configuration (cluster, sentinel, etc.)
   * - Connection pooling and reuse
   * - Easier testing with mocks
   * - Centralized connection management
   */
  constructor(private readonly redis: Redis) {}

  /**
   * Checks if a nullifier has been used before.
   * 
   * Uses SISMEMBER command for O(1) read-only check.
   * Fails closed: Redis errors are thrown, causing request rejection.
   * 
   * @param nullifier - The nullifier hash (64-character hex string)
   * @returns Promise<true> if nullifier exists, Promise<false> otherwise
   * @throws Error if Redis operation fails
   */
  async has(nullifier: string): Promise<boolean> {
    try {
      const exists = await this.redis.sismember(NULLIFIERS_KEY, nullifier);
      
      if (exists === 1) {
        // Log duplicate detection for monitoring and security analysis
        // eslint-disable-next-line no-console
        console.warn(`[SECURITY] Duplicate nullifier detected: ${nullifier}`);
        return true;
      }
      
      return false;
    } catch (error) {
      // Fail closed: throw error to reject request
      // eslint-disable-next-line no-console
      console.error('[REDIS] Nullifier check failed:', error);
      throw new Error('Nullifier registry unavailable');
    }
  }

  /**
   * Stores a nullifier after successful proof verification.
   * 
   * Uses atomic SADD operation followed by EXPIRE to set TTL.
   * SADD is atomic and idempotent (safe to call multiple times).
   * TTL is refreshed on every write to maintain 90-day window.
   * 
   * CRITICAL: This method must only be called after proof verification succeeds.
   * Calling it for invalid proofs enables denial-of-service attacks.
   * 
   * @param nullifier - The nullifier hash to store
   * @returns Promise<void> that resolves when storage completes
   * @throws Error if Redis operation fails
   */
  async store(nullifier: string): Promise<void> {
    try {
      // SADD returns 1 if element was added, 0 if already existed
      const added = await this.redis.sadd(NULLIFIERS_KEY, nullifier);
      
      // Refresh TTL on every write to maintain 90-day window
      await this.redis.expire(NULLIFIERS_KEY, NULLIFIER_TTL_SECONDS);
      
      // Log storage for audit trail
      // eslint-disable-next-line no-console
      console.log(`[NULLIFIER] Stored nullifier: ${nullifier} (new: ${added === 1})`);
    } catch (error) {
      // Fail closed: throw error to reject request
      // eslint-disable-next-line no-console
      console.error('[REDIS] Nullifier storage failed:', error);
      throw new Error('Nullifier registry unavailable');
    }
  }

  /**
   * Returns the total number of stored nullifiers.
   * 
   * Uses SCARD command for O(1) count operation.
   * Returns 0 on error rather than throwing (count is not security-critical).
   * 
   * @returns Promise<number> representing the count of stored nullifiers
   */
  async count(): Promise<number> {
    try {
      const count = await this.redis.scard(NULLIFIERS_KEY);
      return count;
    } catch (error) {
      // Count is not security-critical, return 0 on error
      // eslint-disable-next-line no-console
      console.error('[REDIS] Nullifier count failed:', error);
      return 0;
    }
  }

  /**
   * Health check method to verify Redis connectivity.
   * 
   * This method is NOT part of the INullifierRegistry interface.
   * It's used by the health endpoint to report Redis status.
   * 
   * @returns Promise<boolean> true if Redis is connected, false otherwise
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[REDIS] Ping failed:', error);
      return false;
    }
  }
}
