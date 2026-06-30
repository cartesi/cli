---
"@cartesi/cli": minor
---

feat: support `env` and `env_file` in the `[machine]` section of `cartesi.toml`

Environment variables can now be injected into the Cartesi Machine build
without relying solely on the Dockerfile `ENV`. Define an `env` table with
inline key/value pairs and/or point `env_file` at a `.env` file. Precedence,
from lowest to highest, is: Docker image `ENV` (when `use_docker_env` is
enabled), `env_file`, then the `env` table.
