pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";

template TestRange() {
    signal input value;
    signal input threshold;
    
    component geq = GreaterEqThan(32);
    geq.in[0] <== value;
    geq.in[1] <== threshold;
    
    geq.out === 1;
}

component main {public [threshold]} = TestRange();
