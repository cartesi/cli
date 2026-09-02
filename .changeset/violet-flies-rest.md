---
"@cartesi/cli": patch
---

Require cartesi-machine 0.21.0. The `nvrams` configuration depends on its `--nvram` option, so the default SDK image has to be bumped to one shipping 0.21.0, and a host install of previous version will no longer work.
