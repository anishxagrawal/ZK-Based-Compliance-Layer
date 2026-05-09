/**
 * Static rule-to-circuit mapping used by the compliance service and routes.
 */

import path from "path";

export interface RuleConfig {
  vKeyPath: string;
  wasmPath: string;
  zkeyPath: string;
}

const ROOT = process.cwd();

export const RULES: Record<string, RuleConfig> = {
  age_18: {
    vKeyPath: path.resolve(ROOT, "src/keys/verification_key.json"),
    wasmPath: path.resolve(ROOT, "circuits/age_check_js/age_check.wasm"),
    zkeyPath: path.resolve(ROOT, "age_check_0.zkey")
  },
  kyc_verified: {
    vKeyPath: path.resolve(ROOT, "src/keys/verification_key.json"),
    wasmPath: path.resolve(ROOT, "circuits/age_check_js/age_check.wasm"),
    zkeyPath: path.resolve(ROOT, "age_check_0.zkey")
  },
  sanctions_clear: {
    vKeyPath: path.resolve(ROOT, "src/keys/sanctions_clear_vkey.json"),
    wasmPath: path.resolve(ROOT, "circuits/sanctions_clear_js/sanctions_clear.wasm"),
    zkeyPath: path.resolve(ROOT, "sanctions_clear_0.zkey")
  },
  income_threshold: {
    vKeyPath: path.resolve(ROOT, "src/keys/income_threshold_vkey.json"),
    wasmPath: path.resolve(ROOT, "circuits/income_threshold_js/income_threshold.wasm"),
    zkeyPath: path.resolve(ROOT, "income_threshold_0.zkey")
  }
};
