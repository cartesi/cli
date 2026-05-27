---
"@cartesi/devnet": patch
---

Download artifacts dependencies sequentially to avoid race-condition errors when creating directories and files, which can result in EEXIST followed by ENOENT errors. Also, explicitly configure the task runner to exit on error, so it doesn't publish a package with missing required information.
