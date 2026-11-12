---
"@cartesi/cli": minor
---

`cartesi build` and `cartesi run` now default to SDK 0.12.0-alpha.45, which carries rollups-node 2.0.0-alpha.14 with Dave 3.0.0-alpha.6 and cartesi-machine 0.22. The node's database migration was edited in place, so a database created by an earlier node can't be reused. `cartesi run` recreates its own on every start, and a node you run yourself needs a fresh one.
