---
"@cartesi/sdk": patch
---

raise the devnet anvil's state retention from 3,600 to 86,400 past blocks (--max-persisted-states 86400, the value the rollups-node devnet uses), so reads at older blocks keep working through long cartesi run sessions
