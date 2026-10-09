---
"@cartesi/cli": patch
---

drive `size` and `extra_size` accept the same units as nvram sizes, so "4Mi" now means 4 MiB instead of 4 bytes, and sizes up to petabytes are accepted.
