---
"@cartesi/cli": patch
---

Read the machine snapshot hash with the project's SDK image. Without a local `cartesi-machine-stored-hash`, `cartesi run`, `cartesi hash` and the commands that look up the deployed application read the snapshot in the default SDK image, whose emulator may not load a snapshot built by the `sdk` configured in `cartesi.toml`.
