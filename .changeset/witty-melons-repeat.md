---
"@cartesi/cli": minor
---

Replace the `xgenext2fs` subprocess with the `@deroll/genext2fs` bindings

ext2 drives are now built through [`@deroll/genext2fs`](https://deroll.dev/genext2fs), an N-API
addon, so building a drive no longer shells out to `xgenext2fs` and no longer falls back to
running it inside the SDK Docker image. Docker is still required to build the root drive from a
Dockerfile, and for squashfs drives (`mksquashfs`).

Drive contents are unchanged: the bindings are given the same block size, faketime and
readjustment settings the command line used, so a drive built before and after this change is
byte identical.
