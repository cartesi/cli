# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cartesi CLI — a tool for creating, building, running, and deploying [Cartesi](https://cartesi.io) applications. Distributed via npm and Homebrew (`brew install cartesi/tap/cartesi`).

## Monorepo Structure

-   **Package manager**: Bun (v1.3.6)
-   **Build orchestration**: Turborepo
-   **Linting/formatting**: Biome (4-space indentation, recommended rules)

### Packages

| Package | Path | Purpose |
|---------|------|---------|
| `@cartesi/cli` | `apps/cli/` | Main CLI application (Commander.js) |
| `@cartesi/sdk` | `packages/sdk/` | Docker image with build tools (emulator, genext2fs, kernel) |
| `@cartesi/devnet` | `packages/devnet/` | Local devnet — Foundry contracts + Anvil state |
| `@cartesi/mock-verifying-paymaster` | `packages/mock-verifying-paymaster/` | ERC-4337 paymaster (Fastify server) |
| `tsconfig` | `packages/tsconfig/` | Shared TypeScript configs |

## Common Commands

```bash
bun install                          # Install dependencies
bun run build                        # Build all packages (turbo)
bun run lint                         # Lint all (biome ci)
bun run test                         # Test all packages (turbo)

# CLI-specific
bun run build --filter @cartesi/cli  # Build CLI only
bun test apps/cli/                   # Run all CLI tests
bun test apps/cli/tests/unit/        # Run unit tests only
bun test apps/cli/tests/unit/config.test.ts  # Run a single test

# Devnet (requires Foundry/Anvil installed)
bun run build --filter @cartesi/devnet
```

The CLI build pipeline (`apps/cli`): `clean` → `codegen` (wagmi ABI generation) → `compile` (Bun bundler → `dist/`). It also produces native binaries for darwin-arm64, darwin-x64, linux-arm64, linux-x64 in `apps/cli/bin/`.

## Architecture

### CLI (`apps/cli/src/`)

**Framework**: Commander.js with `@commander-js/extra-typings` for type-safe command definitions.

**Entry point**: `src/index.ts` — registers all commands on the root `cartesi` program.

**Key subsystems**:

-   **`commands/`** — Each file exports a `create*Command()` function returning a Commander command. Main commands: `build`, `run`, `deploy`, `send`, `deposit`, `create`, `doctor`, `shell`, `clean`, `hash`, `logs`, `status`, `address-book`.
-   **`builder/`** — Drive builder implementations (directory, docker, tar, empty, none). Each builder produces ext2 or SquashFS filesystems for Cartesi Machine drives.
-   **`compose/`** — Docker Compose service definitions generated as TypeScript objects (anvil, node, bundler, database, paymaster, proxy, explorer, etc.).
-   **`exec/`** — Wrappers around subprocess execution (cartesi-machine, rollups) using `execa`.
-   **`config.ts`** — Parses `cartesi.toml` (TOML-based project config) into typed `Config` objects. Defines drive configs, machine configs, and SDK versions.
-   **`contracts.ts`** — Generated contract addresses and ABI bindings (via `@wagmi/cli`).
-   **`wallet.ts`** — Wallet utilities using `viem` for Ethereum interaction.

**Patterns**: Uses Listr2 for multi-step task runners with progress indicators. Interactive prompts via `@inquirer`. All blockchain interaction through `viem`.

### Devnet (`packages/devnet/`)

Foundry-based Solidity contracts with Forge build system. Deployment artifacts (ABI JSON + addresses) in `deployments/`. Anvil state snapshot in `anvil_state.json`.

## Versioning

Uses [Changesets](https://github.com/changesets/changesets) for version management. Currently in v2.0.0-alpha series. Release automation via GitHub Actions on `main`, `release/*`, and `prerelease/*` branches.
