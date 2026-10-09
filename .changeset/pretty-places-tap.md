---
"@cartesi/cli": patch
---

pass `accounts_drive_start_index` of `[withdrawal.config]` to the node without losing precision, including values beyond 2^53 written as integers or as decimal or hex strings.
