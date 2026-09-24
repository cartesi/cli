---
"@cartesi/cli": patch
---

Pass the devnet mnemonic to the node as `CARTESI_PRT_AUTH_MNEMONIC` when running with `--prt`. PRT signs with its own identity and the node has no default mnemonic for it, so the service could not start.
