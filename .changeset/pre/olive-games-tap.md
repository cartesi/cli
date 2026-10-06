---
"@cartesi/cli": patch
---

Stop waiting for a service whose container has exited, so a crash loop reports immediately instead of retrying until the timeout.
