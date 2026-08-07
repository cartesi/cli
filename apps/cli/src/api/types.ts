import { getApplicationConfig } from "../base.js";
import type { Config } from "../config.js";

/**
 * Verbosity of the progress information written to the terminal while an API
 * function is running.
 *
 * - `silent`: nothing is written to the terminal (default of the library API);
 * - `default`: spinners and task lists, same as the CLI;
 * - `verbose`: no spinners, one line per event, same as the CLI `--verbose`.
 */
export type Progress = "silent" | "default" | "verbose";

/**
 * Options shared by all API functions that report progress.
 */
export type ProgressOptions = {
    /**
     * How much progress information is written to the terminal.
     * @default "silent"
     */
    progress?: Progress;
};

/**
 * Application configuration, either already parsed, or a path (or list of
 * paths) of TOML configuration files to be read and merged, in order.
 */
export type ConfigInput = Config | string | string[];

export type ConfigOptions = {
    /**
     * Application configuration, or path of the configuration file(s).
     * @default "cartesi.toml"
     */
    config?: ConfigInput;
};

/**
 * Resolve the application configuration from the several ways it can be
 * provided to the API: an already parsed {@link Config}, one configuration file
 * path, a list of configuration file paths, or nothing (which falls back to
 * `cartesi.toml` of the current directory).
 * @param config configuration or path of configuration file(s)
 * @returns parsed application configuration
 */
export const resolveConfig = (config?: ConfigInput): Config => {
    if (config === undefined) {
        return getApplicationConfig(["cartesi.toml"]);
    }
    if (typeof config === "string") {
        return getApplicationConfig([config]);
    }
    if (Array.isArray(config)) {
        return getApplicationConfig(config);
    }
    return config;
};

/**
 * Map a {@link Progress} value to a listr2 renderer name.
 * @param progress progress verbosity
 * @returns name of the listr2 renderer
 */
export const listrRenderer = (progress: Progress = "silent") => {
    switch (progress) {
        case "silent":
            return "silent" as const;
        case "verbose":
            return "verbose" as const;
        case "default":
            return "default" as const;
    }
};
