---
"@cartesi/cli": patch
---

`CARTESI_*_FILE` key files set on the host now reach the node container as copies the node can read. Before, only the path was forwarded and the node couldn't read the file.
