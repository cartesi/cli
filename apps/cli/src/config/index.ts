/**
 * Configuration of a Cartesi application.
 *
 * An application is configured by a `cartesi.config.ts` file that exports a
 * configuration built with {@link defineConfig}, which gives it type checking
 * and editor completion. Applications not written in TypeScript or JavaScript
 * describe the same configuration as plain data, in a `cartesi.config.json`,
 * `cartesi.config.yaml` or `cartesi.config` file.
 *
 * The deprecated `cartesi.toml` file is still read when no other configuration
 * file is present.
 */

export * from "./errors.js";
export { loadConfig, type LoadConfigOptions } from "./load.js";
export { CONFIG_FILES, findConfigFile, LEGACY_CONFIG_FILE } from "./load.js";
export { loadConfigFile } from "./load.js";
export { mergeConfig } from "./merge.js";
export { normalizeConfig } from "./normalize.js";
export { mergeTomlTables, mergeTomlValues, parse } from "./toml.js";
export { parseSize } from "./size.js";
export * from "./types.js";
export * from "./user.js";
