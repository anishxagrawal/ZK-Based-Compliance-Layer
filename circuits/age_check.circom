// Root-level copy of the age-check circuit for compiler and trusted setup workflows.

pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/comparators.circom";

template AgeCheck() {
    signal input age;
    signal input threshold;
    signal output valid;

    component geq = GreaterEqThan(8);
    geq.in[0] <== age;
    geq.in[1] <== threshold;
    valid <== geq.out;
}

component main {public [threshold]} = AgeCheck();
