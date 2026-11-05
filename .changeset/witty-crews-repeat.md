---
"@cartesi/cli": minor
---

`cartesi run --prt` now deploys the application with the PRT sentries set in `cartesi.toml`. A `[prt]` section names an optional `sentry_manager` and `[[prt.sentries]]` entries, appointed on the consensus in that order. An entry with `type = "sling"` and no `address` gets one of the CLI's sentry pool, devnet accounts 20 to 29; an entry with only an `address` is appointed and run elsewhere. Without `--prt` the section is ignored.
