/**
 * Contract for Merkle tree service implementations used by the sanctions_clear circuit.
 *
 * The Merkle tree holds a set of approved identity commitments and provides:
 * - The current root (public input to the circuit)
 * - Merkle paths for approved identities (private input to the circuit)
 * - Registration of new identities
 *
 * Design principles:
 * - Storage-agnostic: can be backed by memory, Redis, or a database
 * - Async-first: all methods return Promises to support I/O
 * - Immutable tree structure: tree is rebuilt after each registration
 */
export interface IMerkleTreeService {
  /**
   * Initializes the hasher and builds the Merkle tree from persisted commitments.
   * Must be called once before any other method.
   * Safe to call multiple times -- subsequent calls are no-ops.
   */
  initialize(): Promise<void>;

  /**
   * Returns the current Merkle tree root as a decimal string.
   * This is the public input the circuit checks proofs against.
   * Changes after every successful registration.
   */
  getRoot(): string;

  /**
   * Returns the Merkle path for a given identity commitment.
   * Returns null if the commitment is not in the approved list.
   *
   * @param commitment - Poseidon(identity_secret) as a decimal string
   */
  getPath(commitment: string): MerklePath | null;

  /**
   * Checks if a commitment is in the approved list.
   *
   * @param commitment - Poseidon(identity_secret) as a decimal string
   */
  isApproved(commitment: string): boolean;

  /**
   * Adds a new identity commitment to the whitelist and rebuilds the tree.
   * Persists the new commitment so it survives server restarts.
   * Returns the new root after the tree is rebuilt.
   *
   * @param commitment - Poseidon(identity_secret) computed in the browser
   * @throws Error if commitment is already registered
   * @throws Error if tree is at maximum capacity (1024 leaves)
   */
  addCommitment(commitment: string): Promise<string>;

  /**
   * Returns the total number of approved identities currently in the tree.
   */
  count(): number;
}

export interface MerklePath {
  root: string;
  pathElements: string[];
  pathIndices: number[];
}
