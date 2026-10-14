import {
    type Config,
    type ConfigCommand,
    loadConfig,
    normalizeConfig,
    type UserConfig,
} from "../config/index.js";

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
 * Application configuration, either written inline in the same shape a
 * `cartesi.config.ts` file exports, or a path (or list of paths) of
 * configuration files to be read and merged, in order. Files of any of the
 * supported formats are accepted. An already resolved {@link Config} is a
 * valid inline configuration as well.
 */
export type ConfigInput = UserConfig | string | string[];

export type ConfigOptions = {
    /**
     * Application configuration, or path of the configuration file(s). When
     * not given, the configuration file of the project is looked up by name.
     */
    config?: ConfigInput;
};

/**
 * Resolve the application configuration from the several ways it can be
 * provided to the API: a configuration written inline, one configuration file
 * path, a list of configuration file paths, or nothing (which looks the
 * configuration file of the project up, and falls back to the defaults when
 * there is none).
 * @param config configuration or path of configuration file(s)
 * @param command command being run, given to a configuration file that exports
 * a function
 * @returns resolved application configuration
 */
export const resolveConfig = async (
    config?: ConfigInput,
    command: ConfigCommand = "build",
): Promise<Config> => {
    if (config === undefined) {
        return loadConfig({ command });
    }
    if (typeof config === "string") {
        return loadConfig({ command, files: [config] });
    }
    if (Array.isArray(config)) {
        return loadConfig({ command, files: config });
    }
    return normalizeConfig(config);
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
