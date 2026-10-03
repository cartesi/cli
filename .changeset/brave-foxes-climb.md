---
"@cartesi/cli": patch
---

Pass `--claim-staging-period` to the node for every consensus type. It was dropped when deploying with `--prt`, so a value given alongside that flag was silently ignored.
