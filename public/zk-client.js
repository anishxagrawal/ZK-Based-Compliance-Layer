/**
 * ZK Client - browser-side proof generator.
 * Private inputs are used only inside generateProof() and never transmitted.
 */

const API_BASE = ""; // empty = same origin
const API_KEY = "f9957b09e07300463be8c34bf6864be717f82cc86271b9013c3db5f960871f1e";

const CIRCUITS = {
  age_18: {
    wasm: "/circuits/age_check_js/age_check.wasm",
    zkey: "/zkeys/age_check_0.zkey"
  },
  income_threshold: {
    wasm: "/circuits/income_threshold_js/income_threshold.wasm",
    zkey: "/zkeys/income_threshold_0.zkey"
  },
  sanctions_clear: {
    wasm: "/circuits/sanctions_clear_js/sanctions_clear.wasm",
    zkey: "/zkeys/sanctions_clear_0.zkey"
  }
};

/**
 * Generates a Groth16 proof entirely in the browser.
 *
 * @param {string} ruleId
 * @param {object} allInputs
 * @returns {Promise<{ proof: object, publicSignals: string[] }>} proof result
 */
async function generateProof(ruleId, allInputs) {
  const circuit = CIRCUITS[ruleId];
  if (!circuit) {
    throw new Error("Unknown ruleId: " + ruleId);
  }
  if (!window.snarkjs) {
    throw new Error("snarkjs not loaded");
  }

  console.log("[zk-client] Generating proof for:", ruleId);

  const result = await window.snarkjs.groth16.fullProve(
    allInputs,
    circuit.wasm,
    circuit.zkey
  );

  console.log("[zk-client] Proof generated. Public signals:", result.publicSignals);
  return result;
}

/**
 * Sends proof to the server's compliance endpoint.
 * Private inputs are NOT in this request.
 */
async function submitCompliance(ruleId, proof, publicSignals) {
  const res = await fetch(`${API_BASE}/compliance/check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY
    },
    body: JSON.stringify({ ruleId, proof, publicSignals })
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * One-shot: generate proof locally, submit to server, return result.
 */
async function proveAndSubmit(ruleId, allInputs) {
  const { proof, publicSignals } = await generateProof(ruleId, allInputs);
  return submitCompliance(ruleId, proof, publicSignals);
}

window.zkClient = { generateProof, submitCompliance, proveAndSubmit, _API_KEY: API_KEY };
