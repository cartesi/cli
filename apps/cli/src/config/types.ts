import { extname } from "node:path";
import type { Address } from "viem";
import { InvalidDriveFormatError } from "./errors.js";

/**
 * Resolved configuration of an application. This is the fully normalized and
 * validated shape the rest of the CLI works with, produced from a
 * {@link UserConfig} written by hand in a configuration file, or built
 * programmatically.
 */

export const DEFAULT_FORMAT = "ext2";
export const DEFAULT_RAM = "128Mi";
export const DEFAULT_SDK_VERSION = "0.12.0-alpha.41";
export const DEFAULT_SDK_IMAGE = "cartesi/sdk";
export const PREFERRED_PORT = 6751;

export type Builder = "directory" | "docker" | "empty" | "none" | "tar";
export type DriveFormat = "ext2" | "sqfs";

/** Block used by the node when fetching new blocks. */
export type DefaultBlock = "latest" | "safe" | "pending" | "finalized";

export const DEFAULT_BLOCKS: readonly DefaultBlock[] = [
    "latest",
    "safe",
    "pending",
    "finalized",
];

export type ImageInfo = {
    cmd: string[];
    entrypoint: string[];
    env: string[];
    workdir: string;
};

export type DriveResult = ImageInfo | undefined;

export type DirectoryDriveConfig = {
    builder: "directory";
    extraSize: number; // default is 0 (no extra size)
    format: DriveFormat;
    directory: string; // required
};

export type DockerDriveConfig = {
    builder: "docker";
    buildArgs: string[]; // default is empty array
    context: string;
    dockerfile: string;
    extraSize: number; // default is 0 (no extra size)
    format: DriveFormat;
    image?: string; // default is to build an image from a Dockerfile
    tags: string[]; // default is empty array
    target?: string; // default is last stage of multi-stage
};

export type EmptyDriveConfig = {
    builder: "empty";
    format: "ext2" | "raw";
    size: number; // in bytes
};

export type ExistingDriveConfig = {
    builder: "none";
    filename: string; // required
    format: DriveFormat;
};

export type TarDriveConfig = {
    builder: "tar";
    filename: string; // required
    format: DriveFormat;
    extraSize: number; // default is 0 (no extra size)
};

export type DriveConfig = (
    | DirectoryDriveConfig
    | DockerDriveConfig
    | EmptyDriveConfig
    | ExistingDriveConfig
    | TarDriveConfig
) & {
    mount?: string | boolean; // default given by cartesi-machine
    shared?: boolean; // default given by cartesi-machine
    user?: string; // default given by cartesi-machine
};

export type MachineConfig = {
    assertRollingTemplate?: boolean; // default given by cartesi-machine
    bootargs: string[];
    entrypoint?: string;
    env: Record<string, string>; // explicit environment variables injected into cartesi-machine ENV
    envFile?: string; // path to a .env file with environment variables injected into cartesi-machine ENV
    maxMCycle?: bigint; // default given by cartesi-machine
    ramLength: string;
    ramImage?: string; // default given by cartesi-machine
    useDockerEnv: boolean; // inject docker image ENV into cartesi-machine ENV
    useDockerWorkdir: boolean; // inject docker image WORKDIR into cartesi-machine WORKDIR
    user?: string; // default given by cartesi-machine
};

/**
 * Configuration of the local development environment started by `cartesi run`.
 *
 * Every field is optional: it defines a project level default for the
 * equivalent command line option, which always takes precedence when given.
 */
export type RunConfig = {
    /**
     * Interval between blocks, in seconds.
     * @default 2
     */
    blockTime?: number;

    /**
     * Number of blocks between a claim being submitted and accepted
     * (Authority/Quorum only).
     * @default 0
     */
    claimStagingPeriod?: number;

    /** Number of cpu limits for the rollups-node. */
    cpus?: number;

    /**
     * Block used when fetching new blocks.
     * @default "latest"
     */
    defaultBlock?: DefaultBlock;

    /**
     * Length of an epoch, in blocks.
     * @default 720
     */
    epochLength?: number;

    /** Block number to fork from. */
    forkBlockNumber?: number;

    /** RPC URL to fork from. */
    forkUrl?: string;

    /** Memory limit for the rollups-node, in MB. */
    memory?: number;

    /**
     * Port to listen on.
     * @default first free port from 6751
     */
    port?: number;

    /**
     * Name of the project, used by docker compose and by the rollups node.
     * @default basename of the current working directory
     */
    projectName?: string;

    /**
     * Deploy the application with PRT consensus.
     * @default false
     */
    prt?: boolean;

    /** Version of the Cartesi Rollups Runtime to use. */
    runtimeVersion?: string;

    /**
     * Optional services to start. The single value `all` starts every optional
     * service.
     * @default []
     */
    services?: string[];

    /**
     * Increase the log level of the environment services.
     * @default false
     */
    verbose?: boolean;
};

/**
 * Configuration for Emergercy-withdrawals that will be passed down to the
 * cartesi-rollups-cli. This is a All or nothing kind of configuration.
 * The properties are kept snake_case to match the expected input in the cartesi-rollups-cli.
 */
export type WithdrawalConfig = {
    guardian: Address;
    log2_leaves_per_account: number;
    log2_max_num_of_accounts: number;
    accounts_drive_start_index: number;
    withdrawal_output_builder: Address;
};

export type Config = {
    drives: Record<string, DriveConfig>;
    machine: MachineConfig;
    run: RunConfig;
    sdk: string;
    withdrawalConfig?: WithdrawalConfig;
};

export const defaultRootDriveConfig = (): DriveConfig => ({
    builder: "docker",
    buildArgs: [],
    context: ".",
    dockerfile: "Dockerfile", // file on current working directory
    extraSize: 0,
    format: DEFAULT_FORMAT,
    tags: [],
});

export const defaultMachineConfig = (): MachineConfig => ({
    assertRollingTemplate: undefined,
    bootargs: [],
    entrypoint: undefined,
    env: {},
    envFile: undefined,
    maxMCycle: undefined,
    ramLength: DEFAULT_RAM,
    useDockerEnv: true,
    useDockerWorkdir: true,
    user: undefined,
});

export const defaultRunConfig = (): RunConfig => ({});

export const defaultConfig = (): Config => ({
    drives: { root: defaultRootDriveConfig() },
    machine: defaultMachineConfig(),
    run: defaultRunConfig(),
    sdk: `${DEFAULT_SDK_IMAGE}:${DEFAULT_SDK_VERSION}`,
    withdrawalConfig: undefined,
});

/**
 * Infer the format of a drive from the extension of its filename.
 * @param filename name of the drive file
 * @returns format of the drive
 */
export const getDriveFormat = (filename: string): DriveFormat => {
    const extension = extname(filename);
    switch (extension) {
        case ".ext2":
            return "ext2";
        case ".sqfs":
            return "sqfs";
        default:
            throw new InvalidDriveFormatError(extension);
    }
};
