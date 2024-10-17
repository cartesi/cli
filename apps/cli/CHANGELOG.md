# Changelog

## 1.3.0

### Minor Changes

-   4d2f8bc: v1.3

## 1.2.0

### Minor Changes

-   93744f4: v1.2

## 1.1.0

### Minor Changes

-   3353d3c: v1.1

### Patch Changes

-   3353d3c: fix release process

## 1.0.0

### Major Changes

-   6bd3be3: 1.0 release

## 0.16.1

### Patch Changes

-   6e6a17d: adds --dry-run to run command
-   f478043: bump cartesi/rollups-node to 1.5.1
-   44c5cca: add --cpus and --memory to run command

## 0.16.0

### Minor Changes

-   988b0b8: flags to disable optional services (explorer, bundler, paymaster)

```diff
$ cartesi run --help
(...)
FLAG DESCRIPTIONS
+  --disable-bundler  disable bundler service
+
+    disable local bundler service to save machine resources
+
+  --disable-explorer  disable explorer service
+
+    disable local explorer service to save machine resources
+
+  --disable-paymaster  disable paymaster service
+
+    disable local paymaster service to save machine resources
```

-   94e15ee: account abstraction contracts information

```diff
$ cartesi address-book
Contract                     Address
AuthorityHistoryPairFactory  0x3890A047Cf9Af60731E80B2105362BbDCD70142D
CartesiDAppFactory           0x7122cd1221C20892234186facfE8615e6743Ab02
DAppAddressRelay             0xF5DE34d6BbC0446E2a45719E718efEbaaE179daE
+EntryPointV06                0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
+EntryPointV07                0x0000000071727De22E5E9d8BAf0edAc6f37da032
ERC1155BatchPortal           0xedB53860A6B52bbb7561Ad596416ee9965B055Aa
ERC1155SinglePortal          0x7CFB0193Ca87eB6e48056885E026552c3A941FC4
ERC20Portal                  0x9C21AEb2093C32DDbC53eEF24B873BDCd1aDa1DB
ERC721Portal                 0x237F8DD094C0e47f4236f12b4Fa01d6Dae89fb87
EtherPortal                  0xFfdbe43d4c855BF7e0f105c400A50857f53AB044
InputBox                     0x59b22D57D4f067708AB0c00552767405926dc768
+LightAccountFactory          0x00004EC70002a32400f8ae005A26081065620D20
SelfHostedApplicationFactory 0x9E32e06Fd23675b2DF8eA8e6b0A25c3DF6a60AbC
+SimpleAccountFactory         0x9406Cc6185a346906296840746125a0E44976454
+SmartAccountFactory          0x000000a56Aaca3e9a4C479ea6b6CD0DbcB6634F5
+KernelFactoryV2              0x5de4839a76cf55d0c90e2061ef4386d962E15ae3
+KernelFactoryV3              0x6723b44Abeec4E71eBE3232BD5B455805baDD22f
+KernelFactoryV3_1            0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419
TestToken                    0x92C6bcA388E99d6B304f1Af3c3Cd749Ff0b591e2
TestNFT                      0xc6582A9b48F211Fa8c2B5b16CB615eC39bcA653B
TestMultiToken               0x04d724738873CB6a86328D2EbAEb2079D715e61e
+VerifyingPaymasterV06        0x28ec0633192d0cBd9E1156CE05D5FdACAcB93947
+VerifyingPaymasterV07        0xc5c97885C67F7361aBAfD2B95067a5bBdA603608
CartesiDApp                  0xab7528bb862fb57e8a2bcd567a2e929a0be56a5e
```

-   1e6de57: account abstraction services (bundler and paymaster)

```diff
$ cartesi run
prompt-1     | Anvil running at http://localhost:8545
prompt-1     | GraphQL running at http://localhost:8080/graphql
prompt-1     | Inspect running at http://localhost:8080/inspect/
prompt-1     | Explorer running at http://localhost:8080/explorer/
+prompt-1     | Bundler running at http://localhost:8080/bundler/rpc
+prompt-1     | Paymaster running at http://localhost:8080/paymaster/
prompt-1     | Press Ctrl+C to stop the node
```

### Patch Changes

-   1031dd0: remove workaround of anvil bug
-   e37a8fd: enable json output of cartesi deploy build

## 0.15.1

### Patch Changes

-   d796cd2: Update SDK version for project scaffold from 0.6 to 0.9

## 0.15.0

### Minor Changes

-   5274d0c: bump node to 1.5.0, change epoch duration semantics and option name
-   8b52ba8: bump sdk to 0.9.0 (new anvil version)

## 0.14.3

### Patch Changes

-   f934a42: fix: actually use sdk_name

## 0.14.2

### Patch Changes

-   65fb9fd: feat: allow to select sdk with .sdk_name label

## 0.14.1

### Patch Changes

-   f1c83d9: update explorer (fix processing bug)

## 0.14.0

### Minor Changes

-   aa088e9: bump to cartesi/sdk:0.6.0 in build and shell
-   9e21c32: use cartesi/sdk for devnet
-   9b527cc: bump default sdk in create to 0.6

### Patch Changes

-   5cf5187: fixed checking docker and docker compose in doctor command
-   e1acf89: use crane to build rootfs tarball

## 0.13.1

### Patch Changes

-   aea5435: fix ext2 drive size specification

## 0.13.0

### Minor Changes

-   459ab03: use latest devnet (renamed test tokens)
-   31f0894: add base_sepolia

### Patch Changes

-   fbb1747: support to base network
-   c629806: remove unused Marketplace contract from address-book
-   18b5b37: refactor sunodo build

## 0.12.0

### Minor Changes

-   fb2b1df: move to sdk 0.4 (machine-emulator-sdk 0.17.1)
-   695189c: remove metamask mobile wallet support
-   d6d969e: replace arbitrum-goerli and optimism-goerli with arbitrum-sepolia and optimism-sepolia
-   5d077e6: remove walletconnect mobile wallet support

### Patch Changes

-   de39bd5: remove unused ledgerhq package
-   012bf1d: fix checking of flag --run-as-root for sunodo shell command

## 0.11.2

### Patch Changes

-   87aaf79: fix no-backend mode

## 0.11.1

### Patch Changes

-   22c2ac7: fix default template branch

## 0.11.0

### Minor Changes

-   4f378cb: use cartesi/rollups-node:0.7.0 instead of our own sunodo/rollups-node
-   5275f61: add deploy command for self-hosted deployment
-   faf2df8: upgrade rollups-explorer to current version
-   93aa5e5: add sunodo hash command
-   394cc65: change default epoch duration from 1 day to 1 hour
-   1fa988a: bump devnet version
-   1ee42f0: add private key option to wallet connection

### Patch Changes

-   9d4cb5e: make sunodo send erc20 ask for the amount
-   3f5c963: make application builds reproducible
-   2552670: reduce sunodo run verbosity

## 0.10.4

### Patch Changes

-   e4e6837: fix .sunodo/ files permissions (#352)
-   2176d01: prepare to enable external database
-   fcfa06a: extract prompt service to its own compose file
-   74d62da: invert service dependency on compose files
-   fe7e52f: add --listen-port to run command
-   121efc2: fix --json command flag

## 0.10.3

### Patch Changes

-   d67a529: refactor docker compose files

## 0.10.2

### Patch Changes

-   f52ec03: bump to sunodo/rollups-node:0.6.1

## 0.10.1

### Patch Changes

-   887649c: fix sunodo/rollups-node version

## 0.10.0

### Minor Changes

-   90a783b: adapt to sunodo/rollups-node:0.6.0

### Patch Changes

-   cb3c899: fix .sunodo/ permission during build

## 0.9.5

### Patch Changes

-   320df7b: sync advance-runner and s6-rc timeouts

## 0.9.4

### Patch Changes

-   ff2d7ce: Remove the prompt Docker volume and use environment variables instead.
-   8c7d10e: use env_file: over environment: at compose
-   36c43c7: fix epoch closing
-   8237cc3: Add traefik config generator compose file to use shared volume in traefik.

## 0.9.3

### Patch Changes

-   b2bce2d: update anvil version

## 0.9.2

### Patch Changes

-   5bda3e6: revert viem back to 1.15.4 (https://github.com/wagmi-dev/viem/issues/1323)

## 0.9.1

### Patch Changes

-   71e7c44: add docker compose snapshot volumes for different sunodo run options

## 0.9.0

### Minor Changes

-   149d2ba: bump sunodo/rollups-node to 0.5.0, which uses cartesi/rollups-node 1.1.0
-   c5cf99e: add rollups-explorer to sunodo local runtime environment

## 0.8.4

### Patch Changes

-   7a39ead: sunodo run will accept a .sunodo.env file

## 0.8.3

### Patch Changes

-   8710678: fix send --chain-id for local devnet
-   5b616e7: fix regression on address-book outside a dapp directory

## 0.8.2

### Patch Changes

-   9515326: bump minimum docker compose version to 2.21.0 (docker breaking change)

## 0.8.1

### Patch Changes

-   9d82fd7: bump rollups to 1.0.2

## 0.8.0

### Minor Changes

-   384b808: add no-backend flag to sunodo run command

### Patch Changes

-   26169e2: fix error message of graceful shutdown of sunodo run
-   57896a0: bump rollups to 1.0.1
-   426a213: fix address-book so getting dapp address works with no-backend

## 0.7.1

### Patch Changes

-   ab2066c: add typescript template
-   9551a97: fix brew installation
-   658f9d1: add rust template
-   b0219f8: change default sunodo/sunodo-templates repository default branch the create command uses
-   6a26d4c: bump devnet to 1.1.0

## 0.7.0

### Minor Changes

-   6f76cf8: hide host's machine-snapshot from validator container
-   3502bba: bump machine-emulator-sdk to 0.16.2
-   28e7bdc: replacing `network` command option with `chain-id`, which is always an integer
-   120239b: remove the --network option of sunodo build
-   611c1ba: bump rollups to 1.0.0

### Patch Changes

-   918601a: fix check of send generic hex value

## 0.6.0

### Minor Changes

-   553fa5d: new command `sunodo send` and its sub-commands to send inputs
-   97a35e0: new command `sunodo doctor` to check system requirements
-   553fa5d: new command `sunodo address-book` to know the addresses of deployed contracts
-   cbddb6f: new `sunodo create` templates for `go` and `ruby`
-   fd955e3: adjust non-verbose mode of `sunodo run` to always print output of the application
-   e175be4: bump rollups to 0.9.1

## 0.5.0

### Minor Changes

-   240b9ac: add new templates (cpp, cpp-low-level, lua)

### Patch Changes

-   8faed78: fix issue #68 using retar tool of new SDK
-   0908b7c: bump to sunodo/rollups-node:0.1.1
-   ad9d396: change default SDK version to 0.15.0

## 0.4.0

### Minor Changes

-   cd8a3f4: - new `sunodo run` command

## 0.3.1

### Minor Changes

-   Fix [#34](https://github.com/sunodo/sunodo/issues/34)

## 0.3.0

### Minor Changes

-   First version using new web3 architecture
-   Initial version of `sunodo build`
-   Initial version of `sunodo clean`
-   Initial version of `sunodo shell`

## 0.2.0

### Minor Changes

-   First working version of CLI with deployed API
    ansactions

## 0.1.0

### Minor Changes

-   First prototype
