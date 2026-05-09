// Age-check circuit exposing whether a private age meets a public threshold.

pragma circom 2.1.6;

include "../../node_modules/circomlib/circuits/comparators.circom";

template AgeCheck() {
    signal input age;
    signal input threshold;
    signal output valid;

    // valid = 1 when age >= threshold, otherwise 0.
    component geq = GreaterEqThan(8); 
    // 8 refers to bitsize here, 0 <= age <= 255
    geq.in[0] <== age;
    geq.in[1] <== threshold;
    valid <== geq.out;
}

component main {public [threshold]} = AgeCheck();
