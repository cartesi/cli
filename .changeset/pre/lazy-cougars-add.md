---
"@cartesi/cli": minor
---

`cartesi run --prt` now runs a sling node for each `[prt.nodes.<label>]` entry with `type = "sling"`, as container `prt-node-<label>`, so claims the sentries agree with are accepted without waiting out `--claim-staging-period`. Pool accounts (devnet 20 to 29) are funded with 10,000 ETH by the CLI. An entry with `private_key_file` runs on your own key, whose address becomes the entry's, and you fund it. The nodes are stopped before a rebuild and started again for the redeployed application.
