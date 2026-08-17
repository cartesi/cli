import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import {
    ConfigFileNotFoundError,
    InvalidConfigExportError,
    UnsupportedConfigFormatError,
} from "./errors.js";
import { mergeConfig } from "./merge.js";
import { normalizeConfig } from "./normalize.js";
import { parse as parseTomlConfig } from "./toml.js";
import type { Config } from "./types.js";
import type {
    ConfigCommand,
    ConfigEnv,
    UserConfig,
    UserConfigFn,
} from "./user.js";

/**
 * Names of the configuration files looked up in the project directory, in
 * order of precedence. The first one that exists is the configuration of the
 * application.
 *
 * TypeScript and JavaScript files export their configuration with
 * `defineConfig`. The remaining formats are for applications not written in
 * TypeScript or JavaScript, and describe the very same configuration as plain
 * data. A file with no format in its name (`cartesi.config`) is read as YAML,
 * which also makes it valid JSON.
 */
export const CONFIG_FILES = [
    "cartesi.config.ts",
    "cartesi.config.mts",
    "cartesi.config.cts",
    "cartesi.config.js",
    "cartesi.config.mjs",
    "cartesi.config.cjs",
    "cartesi.config.json",
    "cartesi.config.yaml",
    "cartesi.config.yml",
    "cartesi.config",
    "cartesi.toml", // deprecated
] as const;

/** Name of the deprecated configuration file. */
export const LEGACY_CONFIG_FILE = "cartesi.toml";

const MODULE_EXTENSIONS = [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"];
const TYPESCRIPT_EXTENSIONS = [".ts", ".mts", ".cts"];

const isLegacyConfigFile = (filename: string): boolean =>
    path.extname(filename) === ".toml";

let legacyWarned = false;

/**
 * Warn, once per process, that the legacy configuration file is deprecated.
 */
const warnLegacyConfig = (filename: string): void => {
    if (legacyWarned) {
        return;
    }
    legacyWarned = true;
    console.warn(
        chalk.yellow(
            `WARNING: the TOML configuration format (${path.basename(filename)}) is deprecated, migrate to cartesi.config.ts, or to cartesi.config.yaml for applications not written in TypeScript`,
        ),
    );
};

/**
 * Find the configuration file of the application.
 * @param cwd directory to look the configuration file up at
 * @returns absolute path of the configuration file, or `undefined` if the
 * application has no configuration file, in which case the defaults apply
 */
export const findConfigFile = (
    cwd: string = process.cwd(),
): string | undefined => {
    for (const name of CONFIG_FILES) {
        const filename = path.resolve(cwd, name);
        if (fs.existsSync(filename)) {
            return filename;
        }
    }
    return undefined;
};

/**
 * Whether the runtime can import a TypeScript file directly. Bun always can,
 * and so does node from the version that strips types on its own.
 */
const canImportTypeScript = (): boolean =>
    process.versions.bun !== undefined || Boolean(process.features.typescript);

/**
 * Import a TypeScript or JavaScript configuration file and return its default
 * export.
 *
 * The file is imported by the runtime itself whenever it can handle
 * TypeScript, which covers the standalone binaries (Bun) and recent versions
 * of node. Older versions of node fall back to `jiti`, which transpiles the
 * file before evaluating it.
 */
const importConfigFile = async (filename: string): Promise<unknown> => {
    let module: unknown;

    if (
        TYPESCRIPT_EXTENSIONS.includes(path.extname(filename)) &&
        !canImportTypeScript()
    ) {
        const { createJiti } = await import("jiti");
        const jiti = createJiti(import.meta.url, { interopDefault: true });
        module = await jiti.import(filename);
    } else {
        // the query string busts the module cache, so a configuration file
        // edited between two builds of the same process is picked up
        const url = `${pathToFileURL(filename).href}?t=${Date.now()}`;
        module = await import(url);
    }

    // a CommonJS file assigning to 'module.exports' also lands on 'default'
    return (module as { default?: unknown })?.default;
};

/**
 * Read one configuration file, of any of the supported formats, without
 * applying any default.
 * @param filename path of the configuration file
 * @param env context given to a configuration file that exports a function
 * @returns configuration as written in the file
 */
export const loadConfigFile = async (
    filename: string,
    env: ConfigEnv,
): Promise<UserConfig> => {
    const extension = path.extname(filename);

    if (MODULE_EXTENSIONS.includes(extension)) {
        const exported = await importConfigFile(filename);
        if (exported === undefined || exported === null) {
            throw new InvalidConfigExportError(filename);
        }

        // a configuration file may export the configuration itself, a promise
        // of one, or a function computing it from the environment
        const config =
            typeof exported === "function"
                ? await (exported as UserConfigFn)(env)
                : await exported;

        if (typeof config !== "object" || config === null) {
            throw new InvalidConfigExportError(filename);
        }
        return config as UserConfig;
    }

    const contents = fs.readFileSync(filename, "utf8");

    switch (extension) {
        case ".json":
            return (JSON.parse(contents) ?? {}) as UserConfig;
        case ".yaml":
        case ".yml":
        // a file with no format in its name, such as 'cartesi.config', is read
        // as YAML, which accepts JSON as well
        case ".config":
            return (parseYaml(contents) ?? {}) as UserConfig;
        case ".toml":
            warnLegacyConfig(filename);
            return parseTomlConfig([contents]);
        default:
            throw new UnsupportedConfigFormatError(filename);
    }
};

export type LoadConfigOptions = {
    /**
     * Command being run, given to a configuration file that exports a
     * function.
     * @default "build"
     */
    command?: ConfigCommand;

    /**
     * Directory the configuration is resolved from.
     * @default process.cwd()
     */
    cwd?: string;

    /**
     * Configuration files to read, merged in order. When empty, the
     * configuration file of the project is looked up by name.
     */
    files?: string[];

    /**
     * Mode the application is being built or run in.
     * @default `CARTESI_ENV`, `NODE_ENV`, or "development"
     */
    mode?: string;
};

/**
 * Load the configuration of an application.
 *
 * Unless configuration files are explicitly given, the project directory is
 * searched for one of the {@link CONFIG_FILES}. An application without a
 * configuration file is perfectly valid, and gets the default configuration.
 *
 * @param options where to load the configuration from
 * @returns resolved application configuration
 */
export const loadConfig = async (
    options: LoadConfigOptions = {},
): Promise<Config> => {
    const cwd = options.cwd ?? process.cwd();
    const env: ConfigEnv = {
        command: options.command ?? "build",
        cwd,
        mode:
            options.mode ??
            process.env.CARTESI_ENV ??
            process.env.NODE_ENV ??
            "development",
    };

    let files: string[];
    if (options.files?.length) {
        files = options.files.map((file) => path.resolve(cwd, file));
        for (const file of files) {
            if (!fs.existsSync(file)) {
                throw new ConfigFileNotFoundError(file);
            }
        }
    } else {
        const found = findConfigFile(cwd);
        files = found ? [found] : [];
    }

    if (files.length === 0) {
        // an application without a configuration file uses the defaults
        return normalizeConfig(undefined);
    }

    if (files.every(isLegacyConfigFile)) {
        // legacy files are merged as TOML tables before being parsed, which is
        // how the deprecated format has always behaved
        for (const file of files) {
            warnLegacyConfig(file);
        }
        return parseTomlConfig(
            files.map((file) => fs.readFileSync(file, "utf8")),
        );
    }

    let config: UserConfig = {};
    for (const file of files) {
        config = mergeConfig(config, await loadConfigFile(file, env));
    }
    return normalizeConfig(config);
};
