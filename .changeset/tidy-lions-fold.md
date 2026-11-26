---
"@cartesi/sdk": patch
---

bump squashfs-tools to 4.7.5, which fixes a possible filesystem corruption with sparse files and a missed duplicate on files larger than the buffer (both introduced in 4.7). Drives holding such files come out byte-different, so a drive hash and the machine template hash may change on rebuild.
