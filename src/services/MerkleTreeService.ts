/**
 * Server-side Poseidon Merkle tree for the sanctions_clear whitelist.
 */
import { buildPoseidon, PoseidonFn } from "circomlibjs";

export interface MerklePath {
  root: string;
  pathElements: string[];
  pathIndices: number[];
}

export class MerkleTreeService {
  private readonly DEPTH = 10;
  private readonly TREE_SIZE = Math.pow(2, 10);

  private poseidon: PoseidonFn | null = null;
  private F: PoseidonFn["F"] | null = null;
  private tree: bigint[] = [];
  private commitmentToIndex: Map<string, number> = new Map();
  private initialized = false;

  private readonly APPROVED_COMMITMENTS: string[] = [
    "18587147201541259002125695546381675692640309638765950598836980321625257723989",
    "17407676228024588307375060494808185668377214548579009094260483029038054423873",
    "1187906673085794891670707751574866400294315419428145822331767160637069288498",
    "9844570690977637410090429453924380345647745497394079884282770716521743941451",
    "14978421504646112173397466804057908810400829209353607180654878934968571317213"
  ];

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log("[MerkleTree] Initializing Poseidon hasher...");
    this.poseidon = await buildPoseidon();
    this.F = this.poseidon.F;

    console.log("[MerkleTree] Building Merkle tree...");
    this.buildTree();

    this.initialized = true;
    console.log(`[MerkleTree] Ready. Root: ${this.getRoot()}`);
    console.log(`[MerkleTree] ${this.APPROVED_COMMITMENTS.length} approved identities loaded`);
  }

  getRoot(): string {
    this.assertInitialized();
    return this.tree[1].toString();
  }

  getPath(commitment: string): MerklePath | null {
    this.assertInitialized();

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
    this.assertInitialized();
    return this.commitmentToIndex.has(commitment);
  }

  private buildTree(): void {
    this.tree = new Array(2 * this.TREE_SIZE).fill(BigInt(0));

    for (let i = 0; i < this.APPROVED_COMMITMENTS.length; i++) {
      if (i >= this.TREE_SIZE) {
        throw new Error(`Too many commitments: max ${this.TREE_SIZE}`);
      }
      const commitment = BigInt(this.APPROVED_COMMITMENTS[i]);
      this.tree[this.TREE_SIZE + i] = commitment;
      this.commitmentToIndex.set(this.APPROVED_COMMITMENTS[i], i);
    }

    for (let i = this.TREE_SIZE - 1; i >= 1; i--) {
      const left = this.tree[2 * i];
      const right = this.tree[2 * i + 1];
      const hash = this.poseidon!([left, right]);
      this.tree[i] = BigInt(this.F!.toString(hash));
    }
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error("MerkleTreeService not initialized. Call initialize() first.");
    }
  }
}
