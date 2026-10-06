---
"@cartesi/cli": minor
---

Add the `foreclose`, `refund` and `withdraw` commands to recover funds from a foreclosed application in the local environment. They run `cartesi-rollups-cli` and `cartesi-rollups-machine-tool` inside the rollups node container.

- `cartesi foreclose` forecloses the application, signing as the guardian of its withdrawal config. By default it signs with the node's signer and finds the guardian among the first 20 accounts of its mnemonic, or uses `--account-index`. A guardian outside the node's signer is set for that one command with `CARTESI_AUTH_MNEMONIC` or `CARTESI_AUTH_PRIVATE_KEY` (and `CARTESI_AUTH_KIND` when both are set).
- `cartesi refund <input-index>` refunds a deposit that was not finalized before the foreclosure. The input bytes are read from the node, or from `--input-file`.
- `cartesi withdraw --account <address>` withdraws the finalized balance of an account. It replays the application up to its last finalized epoch, generates the accounts drive proofs, proves the accounts drive root once, and withdraws. `--proof-file` withdraws with a proof generated elsewhere, once the accounts drive root is proven.

All three accept `--yes`, `--json`, `--no-wait` and `--wait-timeout`, which are forwarded to `cartesi-rollups-cli`.

The replay re-runs every accepted input of the application, so it takes longer the more inputs a long-running application has processed. It stores a snapshot about the size of the machine RAM in the node container's `/tmp`, so it is bounded by the memory and disk available to the container (see `cartesi run --memory`). The snapshot is reused by further withdrawals of the same application, and is lost when the environment is recreated.
