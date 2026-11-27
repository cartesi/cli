---
"@cartesi/cli": minor
---

A `[prt.nodes.<label>]` entry can take `type = "crisium"`: `cartesi run --prt` then runs crisium, the Lua PRT player of the machine-emulator recipes, from the runtime image. As a sentinel (`mode = "sentinel"`, the default) it signs nothing and takes no account, computing the honest claims and reporting what a validator should have done. As a validator (`mode = "validator"`) it claims and disputes with a pool account, a devnet address or `private_key_file`, through a keystore the CLI makes for it, playing `kind = "honest"` (the default) or `"vandal"`, a scripted adversary that posts a made-up claim for epoch 0, loses the dispute and then idles, since only the honest player stores the checkpoints of later epochs. `warning_blocks`, `input_policy` and `dispute_policy` pass through to the player. A crisium node submits no sentry claims, so `sentry = true` is rejected on it.
