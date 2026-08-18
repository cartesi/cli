---
"@cartesi/cli": patch
---

`build` and `shell` now check the cartesi-machine version before booting and stop with an explicit message when it is unsupported, instead of surfacing the emulator's `unrecognized option` traceback.
