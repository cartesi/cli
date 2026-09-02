---
"@cartesi/cli": patch
---

Add support for `nvrams` in `cartesi.toml`. An nvram is a raw range of bytes the guest reaches through a `/dev/uio*` device, with no filesystem and no mount point, so writes are visible to the emulator without a page cache in between. Declare one with `[nvrams.<label>]` and either `size`, for a range filled with zeros, or `filename`, pointing at an existing raw image whose size defines the range. Add `shared` so guest writes are persisted to the image, and `user` so the unprivileged entrypoint user can write to it. Up to 8 nvrams are supported, their labels cannot collide with drive labels, and sizes must be a multiple of 4Ki.
