---
"@cartesi/cli": minor
---

Require cartesi-machine 0.23. Machines stored by 0.22 can't be loaded by 0.23, and the rollups-node and Dave generation the sdk now ships refuses them: rebuild and redeploy every application. `cartesi doctor` applies the same range.
