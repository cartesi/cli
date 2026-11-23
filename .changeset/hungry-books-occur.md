---
"@cartesi/cli": minor
---

the contract addresses and ABIs now come from rollups-contracts and dave v3.0.0-beta.1, through wagmi-plugin 1.0.0-alpha.10: every address moves, the devnet ones included, so applications deployed on the previous generation must be rebuilt on cartesi-machine 0.23 and redeployed, and the devnet state the sdk ships moves with them
