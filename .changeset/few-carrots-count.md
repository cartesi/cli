---
"@cartesi/cli": patch
---

`cartesi run --default-block` no longer accepts `pending`, which the rollups-node no longer supports. Use `latest`, `safe` or `finalized`.
