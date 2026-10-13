---
"@cartesi/cli": minor
---

derive the emergency withdrawal configuration from the accounts drive. Mark the raw drive or nvram that holds the accounts with `accounts_drive = true`, and set `accounts_drive_size` to use only the beginning of a larger drive. `accounts_drive_start_index` and `log2_max_num_of_accounts` are read from the built machine. `[withdrawal]` holds optional overrides: `guardian` and `withdrawal_output_builder`, which default to devnet values (a fork must set the builder), and `account_size` in bytes, 32 by default. `cartesi build` prints the accounts drive and the resulting configuration. `[withdrawal.config]` is no longer supported: remove it and mark the accounts drive instead. An accounts drive in an nvram deploys, but can't be withdrawn from until a rollups-node release with nvram support is in the SDK; use a raw flash drive until then.
