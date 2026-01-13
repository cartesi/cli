# sdk

## 0.12.0-alpha.31

### Patch Changes

- 310e867: switching back chainId from 13370 to 31337

## 0.12.0-alpha.30

### Patch Changes

- 2790e9c: bump squashfs-tools

## 0.12.0-alpha.29

### Patch Changes

- aa6f0aa: bump nodejs

## 0.12.0-alpha.28

### Patch Changes

- c5ca37b: bump cartesi/devnet to 2.0.0-alpha.9

## 0.12.0-alpha.27

### Patch Changes

- c8660fd: bump foundry to v1.4.3
- 46132d0: bump rollups-node to 2.0.0-alpha.9

## 0.12.0-alpha.26

### Minor Changes

- b16d88c: bump su-exec to v0.3
- fb96a82: remove graphql support

### Patch Changes

- b21f850: bump nitro to v0.5

## 0.12.0-alpha.25

### Patch Changes

- a9d9220: add squashfs-tools missing liblzo2 runtime dependency

## 0.12.0-alpha.24

### Patch Changes

- 390e853: bump squashfs-tools to 4.7.2

## 0.12.0-alpha.23

### Patch Changes

- 92a76c2: bump rollups-node to 2.0.0-alpha.8

## 0.12.0-alpha.22

### Patch Changes

- 30d6d1e: bump Debian baseimage to 13 (trixie)
- 45b9b1f: bump rollups-node to 2.0.0-alpha.7

## 0.12.0-alpha.21

### Minor Changes

- 63fecd1: remove crane

### Patch Changes

- ad7c9dc: bump base image to debian:bookworm-20250721-slim

## 0.12.0-alpha.20

### Patch Changes

- 90c1cbe: bump cartesi-rollups-node to 2.0.0-alpha.6
- 1f753e1: bump bookworm baseimage to 20250610

## 0.12.0-alpha.19

### Patch Changes

- 7fbd411: bump devnet

## 0.12.0-alpha.18

### Minor Changes

- 51b69f7: bump machine-emulator to 0.19.0

### Patch Changes

- 83390eb: bump cartesi-rollups-graphql to v2.3.14
- 7134975: bump rollups-espresso-reader to 0.3.0
- fca1d88: bump alto
- 2faaa26: bump cartesi-rollups-node to 2.0.0-alpha.5
- 0bfaca9: bump foundry to 1.2.1
- 0b0bd82: remove unused script
- 36875f0: add passkey-server
- c3eac57: install modern nodejs using nvm

## 0.12.0-alpha.17

### Patch Changes

- 220e8fe: sort smart contract list by name
- 435079f: bump devnet to 2.0.0-alpha.6

## 0.12.0-alpha.16

### Patch Changes

- 6bcc7d6: bump bookworm baseimage to 20250428

## 0.12.0-alpha.15

### Patch Changes

- e30b934: bump rollups-node to 2.0.0-alpha.4
- f09651b: bump bookworm baseimage to 20250407
- 66a555e: bump cartesi-rollups-graphql to v2.3.13

## 0.12.0-alpha.14

### Patch Changes

- 308af49: use differente table to control espresso-reader migrations to avoid conflict with rollups-node migrations
- 2d0e037: move migration to rollups-runtime
- f46f666: bump rollups-node to v2.0.0-alpha.3

## 0.12.0-alpha.13

### Minor Changes

- 9a8f97a: bump PostgreSQL to v17

### Patch Changes

- 9a05154: bump machine-emulator to 0.19.0-alpha3
- 4430af9: bump rollups-node to v2.0.0-alpha.2
- 64eed47: bump rollups-graphql to v2.3.11-node-20250128
- 56dbcda: use devnet 2.0.0-alpha.5

## 0.12.0-alpha.12

### Patch Changes

- c772e6a: refactor Dockerfile for additional runtime and database targets
- 311d01a: add rollups-database and rollups-runtime container image releases

## 0.12.0-alpha.11

### Patch Changes

- ab03476: create cartesi machine snapshot home directory

## 0.12.0-alpha.10

### Patch Changes

- 20ca171: add cartesi-rollups-node-2.0.0-alpha.1
- 2c9b3c0: move espresso-reader migration to its own docker build stage
- 8079499: move graphql migration to its own docker build stage
- e1ddfe9: add initialized postgres database
- 787fbc2: move anvil to its own docker build stage renamed to foundry
- dcd0f3f: install cartesi image-kernel artifacts with proper checksum
- e14a29d: normalize nodejs packages install
- 7cf4d48: sort docker-bake args
- 2e811c7: move go migrate cli to its own docker build stage

## 0.12.0-alpha.9

### Patch Changes

- 2aef692: bump rollups-espresso-reader to 0.2.3-node-20250128

## 0.12.0-alpha.8

### Patch Changes

- 5982c28: fix typo in rollups-graphql migrations path

## 0.12.0-alpha.7

### Patch Changes

- ab85cfc: bump rollups-graphql version to v2.3.8
- ab85cfc: add rollups-graphql database migration code
- 2e9ff93: bump base image to debian:bookworm-20250224
- ab85cfc: add go migrate package
- ab85cfc: add espresso-reader database migration code
- 0973a11: bump espresso-dev-node to 20241120-patch6

## 0.12.0-alpha.6

### Patch Changes

- 38b991d: bump espresso-dev-node to 20241120-patch5

## 0.12.0-alpha.5

### Patch Changes

- af08035: bump devnet to 2.0.0-alpha.3

## 0.12.0-alpha.4

### Minor Changes

- 9a07738: bump anvil to 0.3.0
- 1540871: bump graphql to v2.3.5-node-20250128
- 19a2546: add cartesi-rollups-espresso-reader binary

### Patch Changes

- ab2ed2a: bump base image to debian:bookworm-20250113

## 0.12.0-alpha.3

### Minor Changes

- aeebda0: add cartesi-rollups-graphql binary
- a18955a: add espresso-dev-node binary

### Patch Changes

- 6ec3aba: bump base image to debian:bookworm-20241202
- 1058736: bump debian base image

## 0.12.0-alpha.2

### Minor Changes

- 063d4e4: bump devnet release

## 0.12.0-alpha.1

### Patch Changes

- a1e13ef: bump devnet

## 0.12.0-alpha.0

### Minor Changes

- cd34027: bump devnet to v2

## 0.11.0

### Minor Changes

- 165e454: bump e2fsprogs
- d9933a5: bump machine-emulator to 0.18.1

## 0.10.0

### Minor Changes

- 5e7b918: add paymaster to SDK

## 0.9.0

### Minor Changes

- da69f2e: add alto bundler
- 6b656e2: bump devnet version to include ERC-4337 smart contracts
- 04b57a6: new anvil version with correct dumpState

## 0.8.0

### Minor Changes

- a64d858: bump devnet and anvil

## 0.7.0

### Minor Changes

- 5c5adda: add squashfs-tools package

## 0.6.2

### Patch Changes

- 183029f: feat: script to generate a machine

## 0.6.1

### Patch Changes

- e999bd5: bump xgenext2fs to 1.5.6

## 0.6.0

### Minor Changes

- c65af20: add devnet files

## 0.5.0

### Minor Changes

- 3a44de5: add anvil

### Patch Changes

- 0bcbedb: use xgenext2fs .deb release
- 3c7c7e0: add crane

## 0.4.0

### Minor Changes

- 9e26ec4: move to machine emulator SDK 0.17.1
- 099a834: remove retar script (issues with permission)

## 0.3.0

### Minor Changes

- 445e600: bump version

## 0.2.1

### Patch Changes

- 8a28b06: add build arguments for sunodo/sdk

## 0.2.0

### Minor Changes

- 3502bba: bump machine-emulator-sdk to 0.16.2
- 3502bba: bump genext2fs to 1.5.2

## 0.1.0

### Minor Changes

- 4b70503: add retar tool to fix issue #68 related to sunodo build
- d6162b7: add linux headers to SDK image
