---
"@cartesi/cli": minor
---

`cartesi run` now rejects a `CARTESI_BLOCKCHAIN_HTTP_ENDPOINT` the rollups-node can't use before starting anything. It must be an http(s) URL with a DNS name or IP address. The error doesn't show the value, which may hold credentials.
