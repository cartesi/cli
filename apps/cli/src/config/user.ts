import type { Address } from "viem";
import type { DriveFormat, RunConfig, WithdrawalOptions } from "./types.js";

/**
 * Input types of the application configuration: the shape a developer actually
 * writes, either in a `cartesi.config.ts` file through {@link defineConfig}, or
 * in one of the plain data formats (`cartesi.config.json`,
 * `cartesi.config.yaml`, `cartesi.config`).
 *
 * Everything that has a default is optional here. Sizes accept human readable
 * strings (`"64Mi"`) as well as a number of bytes.
 */

/** A size, either a number of bytes or a human readable string like `"64Mi"`. */
export type Size = number | string;

/**
 * Keys that mark the drive or nvram holding the accounts of emergency
 * withdrawal. At most one drive or nvram may carry them.
 */
export type UserAccountsDriveMarker = {
    /** Whether this drive or nvram holds the accounts of emergency withdrawal. */
    accountsDrive?: boolean;

    /**
     * Keep the accounts in this many bytes at the beginning of the drive,
     * leaving the rest for other application state.
     * @default all of the drive
     */
    accountsDriveSize?: Size;
};

/** A drive built from a directory of the host filesystem. */
export type UserDirectoryDriveConfig = {
    builder: "directory";

    /** Directory to copy into the drive. */
    directory: string;

    /**
     * Extra free space to add to the drive, beyond the size of its contents.
     * @default 0
     */
    extraSize?: Size;

    /** @default "ext2" */
    format?: DriveFormat;
};

/** A drive built from the filesystem of a docker image. */
export type UserDockerDriveConfig = {
    /** @default "docker" */
    builder?: "docker";

    /**
     * Arguments passed to the docker build, as `NAME=value` strings.
     * @default []
     */
    buildArgs?: string[];

    /** @default "." */
    context?: string;

    /** @default "Dockerfile" */
    dockerfile?: string;

    /**
     * Extra free space to add to the drive, beyond the size of its contents.
     * @default 0
     */
    extraSize?: Size;

    /** @default "ext2" */
    format?: DriveFormat;

    /** Use an existing image instead of building one from a Dockerfile. */
    image?: string;

    /**
     * Tags applied to the image built.
     * @default []
     */
    tags?: string[];

    /** Stage to build, defaults to the last stage of a multi-stage build. */
    target?: string;
};

/** An empty drive, to be used as writable storage by the application. */
export type UserEmptyDriveConfig = {
    builder: "empty";

    /** @default "ext2" */
    format?: "ext2" | "raw";

    /**
     * Size of the drive.
     * @default 0
     */
    size?: Size;
};

/** A drive that already exists as a filesystem image on disk. */
export type UserExistingDriveConfig = {
    builder: "none";

    /** Name of the drive file, its extension defines the format. */
    filename: string;

    /** @default inferred from the extension of `filename` */
    format?: DriveFormat;
};

/** A drive built from the contents of a tar archive. */
export type UserTarDriveConfig = {
    builder: "tar";

    /** Name of the tar file. */
    filename: string;

    /**
     * Extra free space to add to the drive, beyond the size of its contents.
     * @default 0
     */
    extraSize?: Size;

    /** @default "ext2" */
    format?: DriveFormat;
};

export type UserDriveConfig = (
    | UserDirectoryDriveConfig
    | UserDockerDriveConfig
    | UserEmptyDriveConfig
    | UserExistingDriveConfig
    | UserTarDriveConfig
) &
    UserAccountsDriveMarker & {
        /** Where the drive is mounted inside the machine. */
        mount?: string | boolean;

        /** Whether writes to the drive are visible to the host. */
        shared?: boolean;

        /** User that owns the files of the drive. */
        user?: string;
    };

/**
 * An nvram of the machine: a raw range of bytes exposed to the guest as a
 * `/dev/uio*` device, with no filesystem and no mount point. Either `size` or
 * `filename` must be given.
 */
export type UserNvramConfig = UserAccountsDriveMarker & {
    /** Path of an existing raw image with the initial contents. */
    filename?: string;

    /** Size of the nvram, a positive multiple of 4Ki. */
    size?: Size;

    /** Whether writes by the guest are persisted to the host. */
    shared?: boolean;

    /** User that owns the image of the nvram. */
    user?: string;
};

/** Configuration of the Cartesi machine of the application. */
export type UserMachineConfig = {
    assertRollingTemplate?: boolean;

    /**
     * Extra arguments appended to the kernel command line.
     * @default []
     */
    bootargs?: string[];

    /** Command the machine runs on boot, overriding the docker image one. */
    entrypoint?: string;

    /**
     * Environment variables injected into the machine. Values that are not
     * strings are coerced to strings.
     * @default {}
     */
    env?: Record<string, string | number | boolean>;

    /** Path of a `.env` file with environment variables injected into the machine. */
    envFile?: string;

    /** Maximum number of machine cycles to run. */
    maxMCycle?: bigint | number;

    /**
     * Amount of RAM of the machine.
     * @default "128Mi"
     */
    ramLength?: string;

    /** Kernel image of the machine. */
    ramImage?: string;

    /**
     * Inject the `ENV` of the docker image of the root drive into the machine.
     * @default true
     */
    useDockerEnv?: boolean;

    /**
     * Inject the `WORKDIR` of the docker image of the root drive into the machine.
     * @default true
     */
    useDockerWorkdir?: boolean;

    /** User the entrypoint runs as. */
    user?: string;
};

/**
 * Overrides of the emergency withdrawal configuration, which otherwise is
 * derived from the accounts drive of the built machine. Only applies to an
 * application that marks a drive or an nvram with `accountsDrive: true`.
 *
 * The keys are the ones of the resolved configuration, which the
 * cartesi-rollups-cli expects in snake_case.
 */
export type UserWithdrawalOptions = {
    /** @default a devnet account */
    guardian?: Address;

    /** @default the devnet TestUsdWithdrawalOutputBuilder */
    withdrawal_output_builder?: Address;

    /**
     * Size of one account, a power of two of at least 32 bytes.
     * @default 32
     */
    account_size?: Size;
};

/**
 * Configuration of an application, as written by a developer.
 *
 * @see {@link defineConfig}
 */
export type UserConfig = {
    /**
     * Drives of the Cartesi machine. A `root` drive built from a `Dockerfile`
     * of the current directory is used when none is defined.
     */
    drives?: Record<string, UserDriveConfig>;

    /** Configuration of the Cartesi machine. */
    machine?: UserMachineConfig;

    /** Nvrams of the Cartesi machine, at most eight. */
    nvrams?: Record<string, UserNvramConfig>;

    /**
     * Project level defaults of the local development environment started by
     * `cartesi run`. Command line options always take precedence.
     */
    run?: RunConfig;

    /**
     * Docker image with the build tools used to build the drives and the
     * machine.
     * @default "cartesi/sdk:<version>"
     */
    sdk?: string;

    /** Overrides of the emergency withdrawal configuration. */
    withdrawal?: UserWithdrawalOptions | WithdrawalOptions;
};

/** Command being run, given to a configuration file that exports a function. */
export type ConfigCommand = "build" | "run" | "shell";

/**
 * Context given to a configuration file that exports a function instead of an
 * object, so the configuration can depend on what is being run.
 */
export type ConfigEnv = {
    /** Command being run. */
    command: ConfigCommand;

    /** Directory the configuration is being resolved from. */
    cwd: string;

    /**
     * Mode the application is being built or run in, from `CARTESI_ENV` or
     * `NODE_ENV`.
     * @default "development"
     */
    mode: string;
};

/** A configuration file that computes its configuration from the environment. */
export type UserConfigFn = (env: ConfigEnv) => UserConfig | Promise<UserConfig>;

/** Anything a configuration file is allowed to export as its default export. */
export type UserConfigExport = UserConfig | Promise<UserConfig> | UserConfigFn;

/**
 * Define the configuration of a Cartesi application.
 *
 * This is an identity function that exists purely to give a `cartesi.config.ts`
 * file type checking and editor completion, without the developer having to
 * annotate the exported value:
 *
 * ```ts
 * import { defineConfig } from "@cartesi/cli/config";
 *
 * export default defineConfig({
 *     drives: {
 *         root: { builder: "docker", dockerfile: "Dockerfile" },
 *     },
 *     machine: { ramLength: "256Mi" },
 *     run: { epochLength: 10 },
 * });
 * ```
 *
 * A function can be exported instead, to configure the application differently
 * depending on the command being run:
 *
 * ```ts
 * export default defineConfig(({ command }) => ({
 *     run: { epochLength: command === "run" ? 10 : 720 },
 * }));
 * ```
 *
 * The function may be asynchronous.
 *
 * @param config configuration object, promise of one, or a function that
 * computes one from the {@link ConfigEnv}
 * @returns the configuration, unchanged
 */
export function defineConfig(config: UserConfig): UserConfig;
export function defineConfig(config: Promise<UserConfig>): Promise<UserConfig>;
export function defineConfig(config: UserConfigFn): UserConfigFn;
export function defineConfig(config: UserConfigExport): UserConfigExport;
export function defineConfig(config: UserConfigExport): UserConfigExport {
    return config;
}
