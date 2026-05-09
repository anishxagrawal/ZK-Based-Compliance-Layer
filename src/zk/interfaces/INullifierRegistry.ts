/**
 * Contract for nullifier registry implementations used to prevent proof replay attacks.
 * 
 * A nullifier is a unique identifier derived from a proof that enables replay prevention
 * without revealing the proof contents. The registry tracks which nullifiers have been
 * used to ensure each proof can only be submitted once per rule.
 * 
 * Design principles:
 * - Storage-agnostic: can be backed by memory, database, blockchain, or distributed cache
 * - Async-first: all methods return Promises to support I/O operations
 * - Simple interface: only three methods needed for complete replay prevention
 * 
 * Implementation examples:
 * - InMemoryNullifierRegistry: Set<string> for development
 * - DatabaseNullifierRegistry: PostgreSQL/MySQL table with indexed nullifier column
 * - RedisNullifierRegistry: Redis SET for distributed systems
 * - ChainNullifierRegistry: Smart contract storage for on-chain verification
 */

export interface INullifierRegistry {
  /**
   * Checks if a nullifier has been used before.
   * 
   * This method is called BEFORE proof verification to quickly reject replay attempts
   * without wasting CPU on expensive cryptographic operations.
   * 
   * @param nullifier - The nullifier hash (64-character hex string)
   * @returns Promise<true> if nullifier exists (proof already used), Promise<false> otherwise
   */
  has(nullifier: string): Promise<boolean>;

  /**
   * Stores a nullifier after successful proof verification.
   * 
   * This method is called ONLY AFTER proof verification succeeds. Storing a nullifier
   * for an invalid proof would enable denial-of-service attacks where attackers poison
   * the registry to block legitimate users.
   * 
   * CRITICAL: Must be called only when verification returns true.
   * 
   * @param nullifier - The nullifier hash to store
   * @returns Promise<void> that resolves when storage completes
   */
  store(nullifier: string): Promise<void>;

  /**
   * Returns the total number of stored nullifiers.
   * 
   * Useful for monitoring, metrics, and capacity planning. In production systems,
   * this helps track registry growth and plan for storage scaling.
   * 
   * @returns Promise<number> representing the count of stored nullifiers
   */
  count(): Promise<number>;
}
