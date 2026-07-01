---
"@cartesi/cli": patch
---

Print logs of the build process when passing --verbose to the build command. It also uses the buildx-metadata generated to recover the image-id not relying on the stdout regardless of the value passed to the --progress flag.
