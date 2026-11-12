---
"@cartesi/cli": minor
---

`cartesi run --prt` now deploys the application with the PRT sentries set in `cartesi.toml`. A `[prt]` section names an optional `sentry_manager` and one `[prt.nodes.<label>]` table per node, with `sentry = true` on the ones to appoint. The sentries are appointed on the consensus in file order. An entry with `type = "sling"` and no `address` gets one of the CLI's PRT pool, devnet accounts 20 to 29. An entry with only an `address` is appointed and run elsewhere. Without `--prt` the section is ignored.
