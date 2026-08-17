---
"@cartesi/cli": minor
---

Add a `defineConfig` function, and configure applications from
`cartesi.config.ts` instead of `cartesi.toml`.

An application is now configured by a `cartesi.config.ts` file that exports its
configuration through `defineConfig`, imported from `@cartesi/cli/config`. The
helper does nothing at runtime, and exists so the configuration is type checked
and completed by the editor. A configuration file may also export a function,
which receives the command being run and the mode, so a project can configure
itself differently for `cartesi build` and `cartesi run`.

Applications not written in TypeScript or JavaScript describe the same
configuration as plain data, in a `cartesi.config.json`, `cartesi.config.yaml`
or `cartesi.config` file.

The configuration gained a `run` section with the project defaults of the local
development environment (`epochLength`, `services`, `blockTime`, `forkUrl`,
...), so they do not have to be repeated on every `cartesi run`. Command line
options take precedence over it.

`cartesi.toml` keeps working, and is read when a project has no other
configuration file, but it is deprecated and now prints a warning.

Sizes are parsed strictly, and understand the IEC units: `"64Mi"` is 64 MiB
instead of being silently read as 64 bytes.

`resolveConfig` is now asynchronous, since a configuration file has to be
imported, and the `config` option of the API functions accepts a configuration
written inline, in the same shape a `cartesi.config.ts` file exports.
