# ZK Compliance System

This repository contains a zero-knowledge compliance API with browser-based proof generation demos.

## Merkle Root Snapshot Behavior

The Merkle root is a snapshot of the whitelist at the time a proof is generated. If new identities
are registered later, the root changes, but proofs generated against older roots remain valid for
that root. The server verifies the proof math against the root embedded in the public signals.
