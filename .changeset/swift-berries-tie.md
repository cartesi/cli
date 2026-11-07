---
"@cartesi/cli": patch
---

Keep `$` in the `CARTESI_*` variables `cartesi run` forwards to the node and in its `--fork-url`. Docker Compose read `$name` in them as a variable, so a value such as a password or an API key in a URL arrived changed.
