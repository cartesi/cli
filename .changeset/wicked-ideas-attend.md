---
"@cartesi/cli": patch
---

derive the emergency withdrawal configuration from the accounts drive. Mark the raw drive or nvram that holds the accounts with `accounts_drive = true`, and set `accounts_drive_size` to use only the beginning of a larger drive. `log2_max_num_of_accounts` and `accounts_drive_start_index` are read from the built machine, and when given in `[withdrawal.config]` they are checked against it. `[withdrawal.config]` is now optional: `guardian` and `withdrawal_output_builder` default to devnet values, which a fork must set. `cartesi build` prints the accounts drive and the resulting configuration. An existing `[withdrawal.config]` keeps working once its drive is marked.
