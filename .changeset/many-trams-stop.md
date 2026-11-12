---
"@cartesi/cli": minor
---

A `[prt.nodes.<label>]` entry can take `role = "claimer"`: `cartesi run --prt` then runs a sling node as the PRT participant and starts the rollups-node in reader mode, as production deployments may do. Changing the claimer in `cartesi.toml` takes effect on the next `cartesi run`, not on a shell rebuild.
