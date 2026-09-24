---
"@cartesi/cli": patch
---

Pass the devnet mnemonic to the node as `CARTESI_PRT_AUTH_MNEMONIC`. The node starts its PRT service on every run and, with claim submission enabled by default, that service requires its own signer, for which PRT has no default.
