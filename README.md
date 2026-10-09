# Cartesi CLI

![Release Packages](https://github.com/cartesi/cli/actions/workflows/release.yaml/badge.svg)

Cartesi CLI is a tool to help creating [Cartesi](http://cartesi.io) applications. It includes commands that help developers to:

- `create` applications from templates
- `build` applications from source to a Cartesi machine
- `run` applications in a local development environment
- `deploy` applications to a live networks

## Apps and Packages

- `cli`: a CLI tool for development, deployment and management of applications, available at `brew install cartesi/tap/cartesi`;
- `sdk`: Docker image to help with Cartesi build and execution;
- `contracts`: smart contracts for application deployment;
- `tsconfig`: `tsconfig.json`s used throughout the monorepo

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

## Build

To build all apps and packages, run the following command:

```shell
bun run build
```
