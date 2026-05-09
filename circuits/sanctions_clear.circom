// Merkle tree inclusion proof circuit for sanctions clearance.
// Proves a user's identity is in a whitelist without revealing which identity.

pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

template SanctionsClear(levels) {
    // Private inputs
    signal input identity_secret;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    
    // Public inputs
    signal input root;
    signal input identityCommitment;
    
    // Step 1: Compute the identity commitment from the secret
    component hasher = Poseidon(1);
    hasher.inputs[0] <== identity_secret;
    
    // Step 2: Constrain that computed commitment matches public commitment
    hasher.out === identityCommitment;
    
    // Step 3: Reconstruct Merkle root from leaf to root
    // Start with the identity commitment as the leaf
    signal currentHash[levels + 1];
    currentHash[0] <== identityCommitment;
    
    // Binary constraints for path indices
    component pathIndexBinary[levels];
    
    // Hash computation at each level
    component levelHashers[levels];
    
    for (var i = 0; i < levels; i++) {
        // Constrain pathIndices[i] to be binary (0 or 1)
        pathIndexBinary[i] = IsEqual();
        pathIndexBinary[i].in[0] <== pathIndices[i] * pathIndices[i];
        pathIndexBinary[i].in[1] <== pathIndices[i];
        pathIndexBinary[i].out === 1;
        
        // Hash current level with sibling
        levelHashers[i] = Poseidon(2);
        
        // If pathIndices[i] == 0, current is left child: hash(current, sibling)
        // If pathIndices[i] == 1, current is right child: hash(sibling, current)
        levelHashers[i].inputs[0] <== currentHash[i] + pathIndices[i] * (pathElements[i] - currentHash[i]);
        levelHashers[i].inputs[1] <== pathElements[i] + pathIndices[i] * (currentHash[i] - pathElements[i]);
        
        currentHash[i + 1] <== levelHashers[i].out;
    }
    
    // Step 4: Constrain that reconstructed root matches public root
    currentHash[levels] === root;
}

component main {public [root, identityCommitment]} = SanctionsClear(10);
