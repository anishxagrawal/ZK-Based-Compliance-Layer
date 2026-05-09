// Income threshold proof circuit with commitment.
// Proves income >= threshold without revealing actual income.
// Uses Poseidon commitment with blinding factor for privacy.

pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

template IncomeThreshold() {
    // Private inputs
    signal input income;
    signal input blinding_factor;
    
    // Public inputs
    signal input threshold;
    signal input commitment;
    
    // Step 1: Verify income >= threshold
    component geq = GreaterEqThan(32);
    geq.in[0] <== income;
    geq.in[1] <== threshold;
    
    // Constrain that comparison result is 1 (true)
    geq.out === 1;
    
    // Step 2: Verify income fits within 32 bits (prevents overflow attacks)
    component incomeBits = Num2Bits(32);
    incomeBits.in <== income;
    
    // Step 3: Compute commitment = Poseidon(income, blinding_factor)
    component hasher = Poseidon(2);
    hasher.inputs[0] <== income;
    hasher.inputs[1] <== blinding_factor;
    
    // Step 4: Constrain that computed commitment matches public commitment
    hasher.out === commitment;
}

component main {public [threshold, commitment]} = IncomeThreshold();
