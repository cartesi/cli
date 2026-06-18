---
"@cartesi/cli": patch
---

Refactor how to retrieve the machine-hash from the image built. the hash file is not generated in the new emulator 0.20.0, instead it generates a hash_tree.sht file where the hash is.
