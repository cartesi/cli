---
"@cartesi/cli": minor
---

Replace the `xgenext2fs` subprocess with the `@tuler/mkext2` bindings

ext2 drives are now built through [`@tuler/mkext2`](https://www.npmjs.com/package/@tuler/mkext2),
a native module that takes the same options as `xgenext2fs` 1.5.6 and stores the same content, so
building a drive no longer shells out to `xgenext2fs` and no longer falls back to running it
inside the SDK Docker image. Docker is still required to build the root drive from a Dockerfile,
and for squashfs drives (`mksquashfs`).

Notable consequences:

- **Drive contents change, so machine hashes change.** The images hold the same files with the
  same permissions, but the filesystems are not laid out byte for byte as `xgenext2fs` laid them
  out — it sized the inode table differently, so a drive also comes out a little smaller or
  larger than before. Applications have to be redeployed.
- **An empty drive without a size is now an error.** `xgenext2fs` refused to build one, while
  mkext2 raises the size to fit an empty filesystem, which is never what `[drives.<label>]` with
  `builder = "empty"` and no `size` meant.
- **An empty directory or tar with no `extra_size` now builds.** `xgenext2fs` refused it with
  "too few blocks"; mkext2 sizes the filesystem to its own metadata and builds a drive with no
  room left in it.
