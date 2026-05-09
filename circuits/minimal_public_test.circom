pragma circom 2.0.0;

template MinimalTest() {
    signal input a;
    signal input b;
    signal output c;
    
    c <== a + b;
}

component main {public [a]} = MinimalTest();
