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
    read `cartesi.toml` from it by default. Functions that take a configuration
    accept a path, a list of paths (merged in order), or an already parsed
    `Config` object;
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

The package is typed, and the types of the configuration file (`Config`,
`DriveConfig`, `MachineConfig`, ...) are exported as well.
