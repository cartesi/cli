---
"@cartesi/sdk": patch
---

Drop the @cartesi/devnet dependency from the image. The anvil state dump is now downloaded directly from the cartesi/dave release selected by CARTESI_PRT_VERSION, so the image no longer ships /usr/share/cartesi/deployments nor DEVNET_VERSION. A PRT_VERSION file is written instead.
