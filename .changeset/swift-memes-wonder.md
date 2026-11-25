---
"@cartesi/cli": minor
---

a crisium entry takes `anomaly_handler = "<file>.lua"`: `cartesi run --prt` mounts the file's directory into the node read-only, puts it on `LUA_PATH` after the recipes and passes `--anomaly-handler=<module>`, so the player calls the module's function with each anomaly's kind and message instead of printing it to stderr. The file's name must be a Lua module name. Since its directory is the mount, the module may `require` helpers next to it, and a subdirectory keeps the mount to that directory
