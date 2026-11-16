# Cartesi CLI

[![npm](https://img.shields.io/npm/v/@cartesi/cli/alpha)](https://www.npmjs.com/package/@cartesi/cli)
[![CLI](https://github.com/cartesi/cli/actions/workflows/cli.yaml/badge.svg)](https://github.com/cartesi/cli/actions/workflows/cli.yaml)
[![License](https://img.shields.io/github/license/cartesi/cli)](LICENSE)

Create, build, run, and interact with [Cartesi](https://cartesi.io) applications from your terminal.

> [!NOTE]
> This README covers Cartesi CLI 2.0, which is currently published as alpha pre-releases under the npm `alpha` tag. The npm `latest` tag and the Homebrew formula (`brew install cartesi/tap/cartesi`) still install the 1.x line.

## Overview

`cartesi build` builds the drives configured for an application, boots a RISC-V Cartesi Machine with them, and stores the resulting machine snapshot in `.cartesi/`. Docker-backed drives are built for `linux/riscv64` with Docker Buildx.

`cartesi run` starts a local environment with Docker Compose and, when a machine snapshot is available, deploys and registers the application on it. The environment includes:

- an Anvil development chain;
- the Cartesi Rollups Node, with its JSON-RPC and Inspect endpoints;
- PostgreSQL; and
- a Traefik proxy that serves every endpoint from a single local port.

## Getting started

### Requirements

- Docker Engine 25.0 or later with Docker Compose 2.24 or later and Buildx 0.13 or later; [Docker Desktop](https://docs.docker.com/desktop/) provides all three
- Docker support for `linux/riscv64`. Docker Desktop includes it; on a standalone Docker Engine, install it with `docker run --privileged --rm tonistiigi/binfmt:riscv`
- Node.js 24 or later when installing through npm

The CLI runs tools such as `cartesi-machine` from your `PATH` when they are installed, and otherwise runs them in Docker. If `cartesi-machine` is installed on the host, it must be version 0.22.x. Machines stored with 0.21 can't be loaded by 0.22, so rebuild and redeploy applications after upgrading.

Run `cartesi doctor` after installation to check these requirements.

### Installation

Install from npm:

```sh
npm install -g @cartesi/cli@alpha
```

Alternatively, download a standalone binary, which does not require Node.js, from [GitHub Releases](https://github.com/cartesi/cli/releases): `cartesi-darwin-arm64`, `cartesi-darwin-x64`, `cartesi-linux-arm64`, or `cartesi-linux-x64` (each as a `.tar.gz` archive). Extract it, rename the executable to `cartesi`, and move it to a directory on your `PATH`.

Verify the installation:

```sh
cartesi --version
cartesi doctor
```

### Create your first application

Create, build, and run an application:

```sh
cartesi create hello --template python
cd hello
cartesi build
cartesi run --services explorer
```

`cartesi run` prints the URLs of the local endpoints and of the explorer. Keep it running and, in another terminal, interact with the application:

```sh
cartesi send "hello world" --encoding string
cartesi status
cartesi address-book
```

The proxy prefers port `6751` and picks another free port up to `6761` when it is taken. Always use the URLs printed by `cartesi run`.

## Commands

| Command                                                               | Purpose                                                               |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `create <name> --template <template>`                                 | Scaffold an application from a template                               |
| `build`                                                               | Build the configured drives and create a machine snapshot             |
| `run`                                                                 | Start the local environment and deploy the application                |
| `send [input]`                                                        | Send an input to the application                                      |
| `deposit ether \| erc20 \| erc721 \| erc1155-single \| erc1155-batch` | Deposit an asset into the application                                 |
| `status`                                                              | Show the status of the local environment                              |
| `logs`                                                                | Show logs from the local node; use `--follow` to stream them          |
| `address-book`                                                        | Print the addresses of the deployed contracts                         |
| `hash`                                                                | Print the machine hash of the built application                       |
| `shell`                                                               | Open a shell inside the application machine                           |
| `clean`                                                               | Delete cached build artifacts                                         |
| `doctor`                                                              | Check local prerequisites                                             |
| `foreclose`                                                           | Foreclose the local application as its guardian so users can withdraw |
| `refund <input-index>`                                                | Refund a deposit that was not finalized before the foreclosure        |
| `withdraw --account <address>`                                        | Withdraw an account's funds from a foreclosed application             |

The `deploy` command is deprecated in 2.0. The `cartesi` CLI is meant for application development; `cartesi-rollups-cli`, distributed with the [Cartesi Rollups Node](https://github.com/cartesi/rollups-node), deploys and registers applications on public networks. Follow the [self-hosted deployment guide](https://docs.cartesi.io/cartesi-rollups/2.0/deployment/self-hosted/standard/) for the complete workflow.

Run `cartesi <command> --help` for every option. The [CLI command reference](https://docs.cartesi.io/get-started/cli-commands/) gives a general overview.

## Configuration

Applications are configured with `cartesi.toml`. Without one, the CLI uses a Docker-backed root drive, 128 MiB of machine RAM, and the other default machine settings. Sizes accept IEC units such as `64Mi` and `4Ki`. The following example increases the RAM to 256 MiB while keeping the default root drive:

```toml
[machine]
ram_length = "256Mi"

[drives.root]
builder = "docker"
dockerfile = "Dockerfile"
format = "ext2"
```

See the [advanced configuration guide](https://docs.cartesi.io/cartesi-rollups/2.0/development/Advanced-configuration/) for all available settings. Pass `-c, --config <file>` to load additional files on top of `cartesi.toml`; the option can be repeated, and later files extend or override earlier ones.

### `run` options

Run `cartesi run --help` to see all options and their defaults. Commonly used ones include `--prt` to deploy with PRT consensus, `--fork-url` to fork an existing Ethereum network, and `--block-time` and `--epoch-length` to tune the local chain.

Set supported `CARTESI_*` variables in the host environment before starting `cartesi run`, and the CLI forwards them to the node. List the supported variables with:

```sh
cartesi run --list-supported-variables
```

### Optional services

Enable optional services with `--services`:

| Service     | Description                                      |
| ----------- | ------------------------------------------------ |
| `explorer`  | Rollups Explorer web interface                   |
| `bundler`   | ERC-4337 bundler                                 |
| `paymaster` | Mock verifying paymaster for account abstraction |
| `passkey`   | Passkey server                                   |
| `all`       | Start every optional service                     |

```sh
cartesi run --services explorer
cartesi run --services bundler,paymaster,passkey
```

### Templates

| Template                   | Language                  |
| -------------------------- | ------------------------- |
| `cpp`, `cpp-low-level`     | C++                       |
| `go`                       | Go                        |
| `java`                     | Java                      |
| `javascript`, `typescript` | JavaScript and TypeScript |
| `lua`                      | Lua                       |
| `python`                   | Python                    |
| `ruby`                     | Ruby                      |
| `rust`                     | Rust                      |

Templates are maintained in [cartesi/application-templates](https://github.com/cartesi/application-templates). Pass `--branch <name>` to `cartesi create` to use a branch other than the CLI's default.

## Development

This section is for working on the CLI itself. The repository is a [Bun](https://bun.sh/) monorepo managed with [Turborepo](https://turbo.build/repo) and [Biome](https://biomejs.dev/):

| Path                                | Package                             | Purpose                                                                 |
| ----------------------------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| `apps/cli`                          | `@cartesi/cli`                      | The CLI, distributed through npm and as native Linux and macOS binaries |
| `packages/sdk`                      | `@cartesi/sdk`                      | Docker image used to build and run Cartesi applications                 |
| `packages/mock-verifying-paymaster` | `@cartesi/mock-verifying-paymaster` | Mock ERC-4337 verifying paymaster used by the optional services         |
| `packages/tsconfig`                 | `tsconfig`                          | Shared TypeScript configurations                                        |

Install dependencies and run the main checks:

```sh
bun install
bun run build
bun run lint
bun run test
```

The full build requires Docker, because it builds the SDK image. CLI integration tests may start containers and pull images. Focused commands include:

```sh
bun run build --filter @cartesi/cli
bun test apps/cli/tests/unit/
```

Releases are managed with [Changesets](https://github.com/changesets/changesets). Publishing `@cartesi/cli` to npm also uploads the native binaries to the matching GitHub release. See the [CLI changelog](apps/cli/CHANGELOG.md) for changes between releases.

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/cartesi/cli).

## Security

Do not open a public issue, pull request, or discussion for a security problem. Report it privately by email to [rollups@cartesi.foundation](mailto:rollups@cartesi.foundation) with the affected component and version, the impact and who is affected, and steps to reproduce. The full policy and the published security reviews are on the [Audit reports](https://docs.cartesi.io/get-started/audit-reports/) page.

## Related projects and support

- [Cartesi documentation](https://docs.cartesi.io/)
- [Cartesi Rollups Node](https://github.com/cartesi/rollups-node)
- [Application templates](https://github.com/cartesi/application-templates)
- [Rollups Explorer](https://github.com/cartesi/rollups-explorer)
- [Cartesi Machine emulator](https://github.com/cartesi/machine-emulator)

For help, join the [Cartesi Discord](https://discord.gg/cartesi). For reproducible bugs and feature requests, open a [GitHub issue](https://github.com/cartesi/cli/issues) and include the output of `cartesi doctor` and `cartesi status --json`, with sensitive information removed.

## License

Licensed under the [Apache License 2.0](LICENSE).
