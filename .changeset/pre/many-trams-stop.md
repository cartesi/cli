---
"@cartesi/cli": minor
---

The rollups-node has its own `[prt.nodes.<label>]` entry, `type = "reference"`, implied when omitted. `claim = false` on it runs the node in reader mode, following the tournaments and recording settled epochs while sling nodes claim, as production deployments may do. Changing it takes effect on the next `cartesi run`, not on a shell rebuild.
