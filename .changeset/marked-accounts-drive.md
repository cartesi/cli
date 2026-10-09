---
"@cartesi/cli": minor
---

derive the emergency withdrawal configuration from an accounts drive marked with `accounts_drive = true`. `accounts_drive_start_index` and `log2_max_num_of_accounts` are read from the built machine, `guardian` and `withdrawal_output_builder` default to devnet values, and `[withdrawal]` only holds optional overrides. `cartesi build` validates the accounts drive and prints its layout. `[withdrawal.config]` is no longer supported.
