---
"@cartesi/cli": minor
---

Replace the `cartesi-machine` subprocess with the `@cartesi/machine` bindings

The Cartesi machine is now configured, booted, stored and hashed through
[`@cartesi/machine`](https://github.com/cartesi/rollups-ts), an N-API addon, so `build`, `shell`
and `status` no longer shell out to `cartesi-machine` or `cartesi-machine-stored-hash`, and no
longer fall back to running them inside the SDK Docker image.

Notable consequences:

- **The machine emulator moved from 0.20 to 0.21**, which is the version `@cartesi/machine`
  links against. Machine hashes change, and applications have to be redeployed.
- **The Linux kernel image is downloaded and cached.** With no SDK image to take it from, the
  default `ram_image` now comes from the pinned `cartesi/machine-linux-image` v0.21.0 release,
  fetched on first use into `$XDG_CACHE_HOME/cartesi/images` (`~/.cache/cartesi/images`) and
  verified against its SHA-256. A `CARTESI_IMAGES_PATH` directory containing the image is used
  when set, and `machine.ram_image` in `cartesi.toml` still takes precedence over both.
- **Boot args are no longer double quoted.** The old code passed `--append-bootargs="<arg>"` to
  the CLI without a shell, so the quotes ended up in the kernel command line. They are gone now.
- **The standalone binaries are no longer built or released.** A Bun single file executable has
  no `node_modules`, and the addon resolves its platform specific `.node` at runtime, so it
  cannot be embedded — not even for the host platform. npm is the only distribution now, and the
  homebrew formula has to install the package from there.
