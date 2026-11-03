/**
 * Configuration of a Cartesi application.
 *
 * An application is configured by a `cartesi.config.ts` file that exports a
 * configuration built with `defineConfig`, which gives it type checking and
 * editor completion. Applications not written in TypeScript or JavaScript
 * describe the same configuration as plain data, in a `cartesi.config.json`,
 * `cartesi.config.yaml` or `cartesi.config` file.
 *
 * The deprecated `cartesi.toml` file is still read when no other configuration
 * file is present.
 */

export {
    type AccountsDrive,
    assertAccountsDriveLength,
    getAccountsDrive,
    getLog2LeavesPerAccount,
    LOG2_LEAF_SIZE,
} from "./config/accounts.js";
export {
    DEFAULT_SDK_IMAGE,
    DEFAULT_SDK_VERSION,
    MAX_NVRAMS,
    NVRAM_ALIGNMENT,
    PREFERRED_PORT,
} from "./config/constants.js";
export {
    defaultConfig,
    defaultMachineConfig,
    defaultRootDriveConfig,
    defaultRunConfig,
} from "./config/defaults.js";
export * from "./config/errors.js";
export {
    CONFIG_FILES,
    findConfigFile,
    LEGACY_CONFIG_FILE,
    loadConfig,
    type LoadConfigOptions,
    loadConfigFile,
} from "./config/load.js";
export { mergeConfig } from "./config/merge.js";
export { normalizeConfig } from "./config/normalize.js";
export { parseBytes, parseSize, splitSize } from "./config/size.js";
export { getDriveFormat } from "./config/toml/drives.js";
export { parse } from "./config/toml/parse.js";
export { DEFAULT_BLOCKS } from "./config/types.js";
export type * from "./config/types.js";
export {
    type ConfigCommand,
    type ConfigEnv,
    defineConfig,
    type Size,
    type UserAccountsDriveMarker,
    type UserConfig,
    type UserConfigExport,
    type UserConfigFn,
    type UserDirectoryDriveConfig,
    type UserDockerDriveConfig,
    type UserDriveConfig,
    type UserEmptyDriveConfig,
    type UserExistingDriveConfig,
    type UserMachineConfig,
    type UserNvramConfig,
    type UserTarDriveConfig,
    type UserWithdrawalOptions,
} from "./config/user.js";
