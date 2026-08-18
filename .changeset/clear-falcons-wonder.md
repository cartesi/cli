---
"@cartesi/cli": patch
---

Fix the cartesi-machine version check ignoring its `forceDocker` option, which made it report the version of the host binary instead of the one inside the SDK image.
