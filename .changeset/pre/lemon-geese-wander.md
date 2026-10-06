---
"@cartesi/cli": patch
---

Allow the node's six `CARTESI_AUTH_*` claimer variables to be overridden from the host environment, matching the PRT set. Without `CARTESI_AUTH_KIND` only plain-mnemonic signing was reachable.
