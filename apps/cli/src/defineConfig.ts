/**
 * Entrypoint of `@cartesi/cli/config`, the module a `cartesi.config.ts` file
 * imports:
 *
 * ```ts
 * import { defineConfig } from "@cartesi/cli/config";
 *
 * export default defineConfig({
 *     machine: { ramLength: "256Mi" },
 * });
 * ```
 *
 * It only carries the configuration types and the helpers that operate on
 * them, so importing it from a configuration file does not pull in the rest of
 * the CLI.
 */

export { mergeConfig } from "./config/merge.js";
export type {
    Config,
    DefaultBlock,
    DirectoryDriveConfig,
    DockerDriveConfig,
    DriveConfig,
    DriveFormat,
    EmptyDriveConfig,
    ExistingDriveConfig,
    ImageInfo,
    MachineConfig,
    RunConfig,
    TarDriveConfig,
    WithdrawalConfig,
} from "./config/types.js";
export {
    DEFAULT_SDK_IMAGE,
    DEFAULT_SDK_VERSION,
    defaultConfig,
    defaultMachineConfig,
    defaultRootDriveConfig,
    defaultRunConfig,
    PREFERRED_PORT,
} from "./config/types.js";
export {
    type ConfigCommand,
    type ConfigEnv,
    defineConfig,
    type Size,
    type UserConfig,
    type UserConfigExport,
    type UserConfigFn,
    type UserDirectoryDriveConfig,
    type UserDockerDriveConfig,
    type UserDriveConfig,
    type UserEmptyDriveConfig,
    type UserExistingDriveConfig,
    type UserMachineConfig,
    type UserTarDriveConfig,
} from "./config/user.js";
