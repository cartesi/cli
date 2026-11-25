---
"@cartesi/cli": minor
---

add --cache-from and --cache-to options to cartesi build

Expose Docker Buildx cache backend options via `--cache-from <spec>` and
`--cache-to <spec>` CLI flags (repeatable). The same options can also be
set per-drive in `cartesi.toml` via `cache_from` and `cache_to` arrays.
CLI flags override the TOML values when provided.
