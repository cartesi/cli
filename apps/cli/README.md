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

## Local development environment

`cartesi run` runs the local environment as processes of the host, with no
docker: anvil for the devnet, a throwaway postgres for the node, the rollups
node, and the PRT nodes and optional services it is asked for, behind a single
port the CLI serves itself. `cartesi build` still uses docker to build the
drives of the machine.

It needs these tools in the `PATH`, which `cartesi doctor` checks:

| Tool                                                                     | Package                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `anvil`                                                                  | [foundry](https://getfoundry.sh) 1.5.1                                          |
| `cartesi-rollups-node`, `cartesi-rollups-cli`                            | [rollups-node](https://github.com/cartesi/rollups-node/releases) 2.0.0-alpha.14 |
| `cartesi-jsonrpc-machine`, `cartesi-rollups-machine-tool`                | [machine-emulator](https://github.com/cartesi/machine-emulator/releases) 0.22.0 |
| `cartesi-sling-node` (with `--prt` and a sling node)                     | [dave](https://github.com/cartesi/dave/releases) 3.0.0-alpha.6                  |
| `alto`, `mock-verifying-paymaster`, `passkey-server` (with `--services`) | npm                                                                             |
| `initdb`, `postgres` (standalone binary only)                            | postgres 18                                                                     |

The npm package ships postgres, through `@embedded-postgres`; the standalone
binaries use the one of the host. The devnet, a state dump of anvil with the
Cartesi contracts deployed, is downloaded on first use, checked against its
checksum, and cached; `CARTESI_DEVNET_STATE` points at another one.

Everything else the environment keeps (the database, the logs, the data of the
PRT nodes and of the withdrawals) lives in one directory of the temporary
directory of the system, removed when the environment stops: every process of
the environment is stopped along with the CLI that started it, which owns it.
A CLI that is killed (`kill -9`) can't clean up, and the next `cartesi run` of
the project stops what it left behind. The project itself is only read.

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

Nvrams, the drive or nvram that holds the accounts of emergency withdrawal,
and the PRT nodes of `cartesi run --prt`, are configured the same way:

```ts
export default defineConfig({
    nvrams: {
        accounts: { accountsDrive: true, size: "4Ki" },
        state: { size: "8Ki", shared: true },
    },
    withdrawal: { account_size: 64 },
    prt: {
        nodes: {
            first: { type: "sling", sentry: true },
            second: { type: "sling", sentry: true },
        },
    },
});
```

An application has no obligation to have a configuration file: without one, it
is built from a `Dockerfile` of its directory, which is what most applications
need.

### Applications not written in TypeScript

The very same configuration can be written as plain data, for applications not
written in TypeScript or JavaScript. The keys are the ones above, plus
`$schema`, which points an editor at a schema and is otherwise ignored:

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

| File                                                       | Format                                   |
| ---------------------------------------------------------- | ---------------------------------------- |
| `cartesi.config.ts`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs` | module exporting `defineConfig({ ... })` |
| `cartesi.config.json`                                      | JSON                                     |
| `cartesi.config.yaml`, `cartesi.config.yml`                | YAML                                     |
| `cartesi.config`                                           | YAML, which accepts JSON as well         |
| `cartesi.toml`                                             | deprecated                               |

TypeScript configuration files are read by the runtime itself, so there is no
build step and no extra dependency: the standalone binaries run on Bun, and
node strips the types from version 24, which this package requires.

A key that no section reads is an error rather than a typo that silently does
nothing, in every format, which is why a `cartesi.config.json` may carry
`$schema` but nothing else the CLI does not know.

### Migrating from `cartesi.toml`

`cartesi.toml` still works, and is read when a project has no other
configuration file, but it is deprecated and prints a warning. The new formats
describe the same configuration, with one difference: keys are camelCase, as
the resolved configuration already is, so `extra_size` becomes `extraSize`,
`boot_args` becomes `bootargs` and `accounts_drive` becomes `accountsDrive`.
The keys of the `withdrawal` section keep the names the `cartesi-rollups-cli`
expects (`account_size`, `withdrawal_output_builder`).

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
`depositErc1155Batch`, `depositEther`, `doctor`, `foreclose`, `hash`, `logs`,
`refund`, `run`, `send`, `shell`, `status` and `withdraw`.

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
    background until `stop()` is called, and keeps the process up until then.
    Its processes are stopped when the process exits, if `stop()` was not
    called. Use `deploy()` to redeploy the application after a rebuild;
-   `send` and the `deposit*` functions resolve the application address, the
    sender and the RPC URL from the running project, and never prompt for them.
    Amounts are given in the base unit of the asset as a `bigint`, or in its
    display unit as a string (`"1.5"`). A deposit that cannot be made throws a
    `DepositError` (`InsufficientBalanceError`, `InvalidAmountError` or
    `TokenNotFoundError`);
-   `foreclose`, `refund` and `withdraw` send their transaction with
    cartesi-rollups-cli, with the environment of the rollups node, without asking for
    confirmation, and return its JSON output. With `stream: true` they attach
    it to the terminal instead, as the CLI does.

The package is typed, and the types of the configuration file (`UserConfig`,
`Config`, `DriveConfig`, `MachineConfig`, `RunConfig`, ...) are exported as
well, along with `defineConfig`, `loadConfig`, `findConfigFile`,
`normalizeConfig` and `mergeConfig`.
