---
"@cartesi/cli": patch
---

accept `account_size` in bytes in `[withdrawal.config]`, as a simpler alternative to `log2_leaves_per_account`. It defaults to 32 bytes, which the devnet withdrawal output builder requires.
