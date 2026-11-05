---
"@cartesi/cli": patch
---

`cartesi run`'s Build and redeploy no longer fails with "CARTESI_CONTRACTS_APPLICATION_FACTORY_ADDRESS: variable not defined". The CLI now passes the devnet's ApplicationFactory address to the node, which `CARTESI_CONTRACTS_APPLICATION_FACTORY_ADDRESS` can still override.
