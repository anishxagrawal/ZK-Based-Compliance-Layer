declare module "circomlibjs" {
  export interface PoseidonFn {
    (inputs: bigint[]): bigint;
    F: {
      toString(value: bigint): string;
    };
  }

  export function buildPoseidon(): Promise<PoseidonFn>;
}
