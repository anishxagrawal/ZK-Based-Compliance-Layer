/**
 * In-memory nullifier registry for development and testing.
 * 
 * ⚠️  WARNING: FOR DEVELOPMENT ONLY ⚠️
 * 
 * This implementation stores nullifiers in a JavaScript Set, which means:
 * - All data is lost when the server restarts
 * - Data is not shared across multiple server instances
 * - No persistence or backup
 * - Limited by available RAM
 * 
 * PRODUCTION REQUIREMENTS:
 * Replace this with a persistent storage implementation such as:
 * - DatabaseNullifierRegistry (PostgreSQL, MySQL, MongoDB)
 * - RedisNullifierRegistry (Redis SET for distributed systems)
 * - ChainNullifierRegistry (blockchain smart contract)
 * 
 * The interface remains the same - only the implementation changes.
 * No application code needs to be modified when switching implementations.
 * 
 * SECURITY IMPLICATIONS:
 * Using this in production allows replay attacks after server restart.
 * An attacker who knows the server restarted can resubmit previously used proofs.
 */

import { INullifierRegistry } from '../interfaces/INullifierRegistry';

export class InMemoryNullifierRegistry implements INullifierRegistry {
  /**
   * Internal storage using a Set for O(1) lookups and insertions.
   * Set operations in JavaScript are synchronous and thread-safe for single-process Node.js.
   */
  private readonly nullifiers: Set<string> = new Set();

  /**
   * Checks if a nullifier has been used before.
   * 
   * @param nullifier - The nullifier hash (64-character hex string)
   * @returns Promise<true> if nullifier exists, Promise<false> otherwise
   */
  async has(nullifier: string): Promise<boolean> {
    const exists = this.nullifiers.has(nullifier);
    
    if (exists) {
      // Log duplicate detection for monitoring and security analysis
      // eslint-disable-next-line no-console
      console.warn(`[SECURITY] Duplicate nullifier detected: ${nullifier}`);
    }
    
    return exists;
  }

  /**
   * Stores a nullifier after successful proof verification.
   * 
   * CRITICAL: This method must only be called after proof verification succeeds.
   * Calling it for invalid proofs enables denial-of-service attacks.
   * 
   * @param nullifier - The nullifier hash to store
   * @returns Promise<void> that resolves immediately
   */
  async store(nullifier: string): Promise<void> {
    this.nullifiers.add(nullifier);
    
    // Log storage for audit trail
    // eslint-disable-next-line no-console
    console.log(`[NULLIFIER] Stored nullifier: ${nullifier} (total: ${this.nullifiers.size})`);
  }

  /**
   * Returns the total number of stored nullifiers.
   * 
   * @returns Promise<number> representing the count of stored nullifiers
   */
  async count(): Promise<number> {
    return this.nullifiers.size;
  }

  /**
   * Clears all stored nullifiers.
   * 
   * ⚠️  FOR TESTING ONLY - DO NOT USE IN PRODUCTION
   * 
   * This method is useful for resetting state between test runs.
   * It is not part of the INullifierRegistry interface and should not be
   * called by application code.
   */
  clear(): void {
    this.nullifiers.clear();
    // eslint-disable-next-line no-console
    console.log('[NULLIFIER] Registry cleared (testing only)');
  }
}
