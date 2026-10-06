---
"@cartesi/cli": patch
---

Bound the wait for services to become healthy. The backoff had no upper limit, so a service that never started held `cartesi run` for up to 19 hours instead of failing.
