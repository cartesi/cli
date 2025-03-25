# sdk

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
