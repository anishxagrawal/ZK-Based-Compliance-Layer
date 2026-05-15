/**
 * Server-side Poseidon Merkle tree for the sanctions_clear whitelist.
 *
 * Implements IMerkleTreeService.
 *
 * Changes from previous version:
 * - Implements IMerkleTreeService interface
 * - Accepts Redis client via constructor injection
 * - Loads commitments from Redis on initialize() instead of hardcoded array
 * - Falls back to SEED_COMMITMENTS if Redis is empty (first boot)
 * - addCommitment() persists to Redis then rebuilds tree
 * - commitments list is now mutable (not readonly)
 * - MerklePath type imported from interface file
 */
import { buildPoseidon, PoseidonFn } from "circomlibjs";
import type { Redis } from "ioredis";

import { IMerkleTreeService, MerklePath } from "../zk/interfaces/IMerkleTreeService";

/**
 * Redis key where the commitments list is persisted.
 * Type: Redis LIST -- preserves insertion order, supports RPUSH and LRANGE.
 */
const COMMITMENTS_KEY = "sanctions:commitments";

/**
 * Seed commitments used on first boot when Redis is empty.
 * Secrets for testing only: 1234567890, 9876543210, 1111111111, 2222222222, 3333333333
 */
const SEED_COMMITMENTS: string[] = [
  "18587147201541259002125695546381675692640309638765950598836980321625257723989",
  "17407676228024588307375060494808185668377214548579009094260483029038054423873",
  "1187906673085794891670707751574866400294315419428145822331767160637069288498",
  "9844570690977637410090429453924380345647745497394079884282770716521743941451",
  "14978421504646112173397466804057908810400829209353607180654878934968571317213"
];

export class MerkleTreeService implements IMerkleTreeService {
  private readonly DEPTH = 10;
  private readonly TREE_SIZE = Math.pow(2, 10); // 1024

  private poseidon: PoseidonFn | null = null;
  private F: PoseidonFn["F"] | null = null;
  private tree: bigint[] = [];
  private commitmentToIndex: Map<string, number> = new Map();
  private initialized = false;

  // Mutable list that grows as new identities register.
  private commitments: string[] = [];

  /**
   * @param redis - Injected Redis client from app.ts
   *               Same client used by RedisNullifierRegistry
   *               No new connections created
   */
  constructor(private readonly redis: Redis) {}

  /**
   * Initializes Poseidon hasher, loads commitments from Redis, builds tree.
   *
   * Load sequence:
   * 1. Build Poseidon hasher
   * 2. Load commitments from Redis (LRANGE sanctions:commitments 0 -1)
   * 3. If Redis is empty, seed with SEED_COMMITMENTS and persist them
   * 4. Build the Merkle tree in memory
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log("[MerkleTree] Initializing Poseidon hasher...");
    this.poseidon = await buildPoseidon();
    this.F = this.poseidon.F;

    console.log("[MerkleTree] Loading commitments from Redis...");
    await this._loadFromRedis();

    console.log("[MerkleTree] Building Merkle tree...");
    this._buildTree();

    this.initialized = true;
    console.log(`[MerkleTree] Ready. Root: ${this.getRoot()}`);
    console.log(`[MerkleTree] ${this.commitments.length} approved identities loaded`);
  }

  getRoot(): string {
    this._assertInitialized();
    return this.tree[1].toString();
  }

  getPath(commitment: string): MerklePath | null {
    this._assertInitialized();

    const leafIndex = this.commitmentToIndex.get(commitment);
    if (leafIndex === undefined) return null;

    const pathElements: string[] = [];
    const pathIndices: number[] = [];

    let currentIndex = this.TREE_SIZE + leafIndex;

    for (let level = 0; level < this.DEPTH; level++) {
      const isRightChild = currentIndex % 2 === 1;

      if (isRightChild) {
        pathElements.push(this.tree[currentIndex - 1].toString());
        pathIndices.push(1);
      } else {
        pathElements.push(this.tree[currentIndex + 1].toString());
        pathIndices.push(0);
      }

      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      root: this.getRoot(),
      pathElements,
      pathIndices
    };
  }

  isApproved(commitment: string): boolean {
    this._assertInitialized();
    return this.commitmentToIndex.has(commitment);
  }

  count(): number {
    this._assertInitialized();
    return this.commitments.length;
  }

  /**
   * Registers a new identity commitment.
   *
   * Sequence:
   * 1. Validate commitment format (decimal number string)
   * 2. Check not already registered
   * 3. Check tree not at capacity (max 1024 leaves)
   * 4. Persist to Redis with RPUSH
   * 5. Add to in-memory commitments array
   * 6. Rebuild Merkle tree
   * 7. Return new root
   */
  async addCommitment(commitment: string): Promise<string> {
    this._assertInitialized();

    if (!commitment || !/^\d+$/.test(commitment)) {
      throw new Error("Invalid commitment format. Expected a decimal number string.");
    }

    if (this.commitmentToIndex.has(commitment)) {
      throw new Error("Commitment already registered.");
    }

    if (this.commitments.length >= this.TREE_SIZE) {
      throw new Error(`Tree at maximum capacity: ${this.TREE_SIZE} identities.`);
    }

    await this.redis.rpush(COMMITMENTS_KEY, commitment);
    console.log("[MerkleTree] Persisted new commitment to Redis");

    this.commitments.push(commitment);
    this._buildTree();

    const newRoot = this.getRoot();
    console.log(`[MerkleTree] Tree rebuilt. New root: ${newRoot}`);
    console.log(`[MerkleTree] Total identities: ${this.commitments.length}`);

    return newRoot;
  }

  /**
   * Loads commitments from Redis.
   * If Redis is empty, seeds with SEED_COMMITMENTS and persists them.
   */
  private async _loadFromRedis(): Promise<void> {
    try {
      const stored = await this.redis.lrange(COMMITMENTS_KEY, 0, -1);

      if (stored.length === 0) {
        console.log("[MerkleTree] Redis empty. Seeding with initial commitments...");
        this.commitments = [...SEED_COMMITMENTS];
        await this.redis.rpush(COMMITMENTS_KEY, ...SEED_COMMITMENTS);
        console.log(`[MerkleTree] Seeded ${SEED_COMMITMENTS.length} commitments to Redis`);
      } else {
        this.commitments = stored;
        console.log(`[MerkleTree] Loaded ${stored.length} commitments from Redis`);
      }
    } catch (error) {
      console.error("[MerkleTree] Redis load failed, using seed commitments:", error);
      this.commitments = [...SEED_COMMITMENTS];
    }
  }

  /**
   * Builds the full 1024-leaf Poseidon Merkle tree from this.commitments.
   * Called on initialize() and after every addCommitment().
   * Resets commitmentToIndex map before rebuilding.
   */
  private _buildTree(): void {
    this.commitmentToIndex = new Map();
    this.tree = new Array(2 * this.TREE_SIZE).fill(BigInt(0));

    for (let i = 0; i < this.commitments.length; i++) {
      if (i >= this.TREE_SIZE) break;
      const commitment = BigInt(this.commitments[i]);
      this.tree[this.TREE_SIZE + i] = commitment;
      this.commitmentToIndex.set(this.commitments[i], i);
    }

    for (let i = this.TREE_SIZE - 1; i >= 1; i--) {
      const left = this.tree[2 * i];
      const right = this.tree[2 * i + 1];
      const hash = this.poseidon!([left, right]);
      this.tree[i] = BigInt(this.F!.toString(hash));
    }
  }

  private _assertInitialized(): void {
    if (!this.initialized) {
      throw new Error("MerkleTreeService not initialized. Call initialize() first.");
    }
  }
}
