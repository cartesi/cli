/**
 * Programmatic API of the Cartesi CLI.
 *
 * Every command of the CLI is also available as a function, so applications can
 * be built, run and inspected from a script:
 *
 * ```ts
 * import { build, hash, run } from "@cartesi/cli";
 *
 * await build();
 * console.log(await hash());
 *
 * const node = await run();
 * // ...
 * await node.stop();
 * ```
 *
 * Unless stated otherwise, functions operate on the current working directory,
 * just like the CLI, and are silent: nothing is written to the terminal. Pass
 * `progress: "default"` to get the same output as the CLI.
 */
export * from "./api/index.js";

// configuration of an application ('cartesi.toml')
export {
    type Config,
    DEFAULT_SDK_IMAGE,
    DEFAULT_SDK_VERSION,
    defaultConfig,
    defaultMachineConfig,
    defaultRootDriveConfig,
    type DirectoryDriveConfig,
    type DockerDriveConfig,
    type DriveConfig,
    type DriveFormat,
    type EmptyDriveConfig,
    type ExistingDriveConfig,
    type ImageInfo,
    type MachineConfig,
    parse as parseConfig,
    PREFERRED_PORT,
    type TarDriveConfig,
    type WithdrawalConfig,
} from "./config.js";

// runtime environment
export {
    AVAILABLE_SERVICES,
    type RollupsDeployment,
} from "./exec/rollups.js";

export type { ForkConfig } from "./types/chain.js";
export { cartesi } from "./wallet.js";
