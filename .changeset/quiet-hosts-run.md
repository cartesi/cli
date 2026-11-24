---
"@cartesi/cli": minor
---

run the local environment of `cartesi run` as processes of the host instead of docker containers: anvil, a throwaway postgres (from `@embedded-postgres`), the rollups node, the PRT nodes and the optional services, behind a proxy served by the CLI, with everything they keep removed when the environment stops. The explorer service, which only exists as a docker image, is no longer available, and `--cpus` and `--memory` are ignored
