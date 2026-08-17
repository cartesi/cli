# Cartesi CLI

Cartesi CLI provides a tool to help developers to:

-   `create` applications from templates
-   `build` applications from source to a cartesi machine
-   `run` applications in a local development environment
-   `deploy` applications to a live network

It's distributed through several channels including `npm` and `homebrew`.

## Installation

```shell
brew install cartesi/tap/cartesi
cartesi --help
```

More documentation at [https://docs.cartesi.io](https://docs.cartesi.io).

## Configuration

An application is configured by a `cartesi.config.ts` file at its root, which
exports its configuration through `defineConfig`:

```ts
import { defineConfig } from "@cartesi/cli/config";

export default defineConfig({
    drives: {
        root: { builder: "docker", dockerfile: "Dockerfile" },
        data: { builder: "empty", size: "64Mi", mount: "/mnt/data" },
    },
    machine: {
        entrypoint: "dapp",
        ramLength: "256Mi",
    },
    run: {
        epochLength: 10,
        services: ["explorer"],
    },
});
```

`defineConfig` does nothing at runtime: it exists so the configuration is type
checked and completed by the editor, without any annotation. A configuration
file is free to compute its configuration, and to export a function instead of
an object when it depends on what is being run:

```ts
export default defineConfig(async ({ command, mode }) => ({
    machine: { envFile: `.env.${mode}` },
    run: { epochLength: command === "run" ? 10 : 720 },
}));
```

`mode` comes from `CARTESI_ENV` (or `NODE_ENV`), and defaults to
`development`.

The `run` section holds the defaults of the local development environment
started by `cartesi run`, so a project does not have to repeat the same
options on every invocation. Command line options always take precedence over
it.

An application has no obligation to have a configuration file: without one, it
is built from a `Dockerfile` of its directory, which is what most applications
need.

### Applications not written in TypeScript

The very same configuration can be written as plain data, for applications not
written in TypeScript or JavaScript. The keys are the ones above, and a
`$schema` key is accepted and ignored:

```yaml
# cartesi.config.yaml
machine:
    entrypoint: dapp
    ramLength: 256Mi
drives:
    data:
        builder: empty
        size: 64Mi
        mount: /mnt/data
run:
    epochLength: 10
```

The configuration file of a project is the first of these that exists:

| File                                                                       | Format                                    |
| -------------------------------------------------------------------------- | ----------------------------------------- |
| `cartesi.config.ts`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`                 | module exporting `defineConfig({ ... })`  |
| `cartesi.config.json`                                                      | JSON                                      |
| `cartesi.config.yaml`, `cartesi.config.yml`                                | YAML                                      |
| `cartesi.config`                                                           | YAML, which accepts JSON as well          |
| `cartesi.toml`                                                             | deprecated                                |

TypeScript configuration files are read by the runtime itself, and do not need
a build step. Sizes accept a number of bytes or a human readable string, and
every unit is a binary multiple: `64Mi`, `64MiB`, `64Mb` and `64MB` are all
the same 67108864 bytes.

### Migrating from `cartesi.toml`

`cartesi.toml` still works, and is read when a project has no other
configuration file, but it is deprecated and prints a warning. The new formats
describe the same configuration, with two differences: keys are camelCase
(`extra_size` becomes `extraSize`, `boot_args` becomes `bootargs`), and
`[withdrawal.config]` becomes a `withdrawal` object.

## Library

Every command of the CLI is also available as a function, so applications can be
built, run and inspected from a script, without going through the command line:

```shell
npm install @cartesi/cli
```

```ts
import { build, depositErc20, hash, run, send } from "@cartesi/cli";

// build the application, same as `cartesi build`
await build();

// read the template hash of the machine snapshot, same as `cartesi hash`
console.log(await hash());

// start a local node and deploy the application to it, same as `cartesi run`
const node = await run({ epochLength: 10 });
console.log(`running at ${node.url}, deployed at ${node.deployment?.address}`);

// send an input to the application, same as `cartesi send`
await send({ input: "hello" });

// deposit tokens to the application, same as `cartesi deposit erc20`
await depositErc20({ amount: "1.5" });

await node.stop();
```

The following functions are available: `addressBook`, `build`, `clean`,
`create`, `depositErc20`, `depositErc721`, `depositErc1155`,
`depositErc1155Batch`, `depositEther`, `doctor`, `hash`, `logs`, `run`, `send`,
`shell` and `status`.

A few things to keep in mind:

-   functions operate on the current working directory, just like the CLI, and
    look the configuration file of the project up in it by default. Functions
    that take a configuration accept a path, a list of paths (merged in order),
    or the configuration written inline, in the same shape a `cartesi.config.ts`
    file exports:

    ```ts
    await build({ config: { machine: { ramLength: "256Mi" } } });
    await build({ config: "cartesi.config.production.ts" });
    ```
-   functions are silent, and never write to the terminal. Pass
    `progress: "default"` (or `"verbose"`) to get the same output as the CLI;
-   functions throw on error, and never terminate the process;
-   `run` returns a handle of the environment, which keeps running in the
    background until `stop()` is called. Use `deploy()` to redeploy the
    application after a rebuild;
-   `send` and the `deposit*` functions resolve the application address, the
    sender and the RPC URL from the running project, and never prompt for them.
    Amounts are given in the base unit of the asset as a `bigint`, or in its
    display unit as a string (`"1.5"`). A deposit that cannot be made throws a
    `DepositError` (`InsufficientBalanceError`, `InvalidAmountError` or
    `TokenNotFoundError`).

The package is typed, and the types of the configuration file (`UserConfig`,
`Config`, `DriveConfig`, `MachineConfig`, `RunConfig`, ...) are exported as
well, along with `defineConfig`, `loadConfig`, `findConfigFile`,
`normalizeConfig` and `mergeConfig`.
