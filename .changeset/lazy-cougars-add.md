---
"@cartesi/cli": minor
---

`cartesi run --prt` now runs a sling node for each `[[prt.sentries]]` entry with `type = "sling"`, as container `sentry-<label>`, so claims the sentries agree with are accepted without waiting out `--claim-staging-period`. Pool sentries (devnet accounts 20 to 29) are funded with 10,000 ETH by the CLI; an entry with `private_key_file` runs on your own key, whose address becomes the sentry's, and you fund it. The sentries are stopped before a rebuild and started again for the redeployed application.
