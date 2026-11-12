---
"@cartesi/cli": minor
---

`cartesi send` and `cartesi deposit` now default to devnet account 8 instead of account 0, which the node uses to sign its claims. Pass `--from` to pick another account.
