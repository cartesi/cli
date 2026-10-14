import { extname } from "node:path";
import type { Address } from "viem";
import {
    InvalidAccountsDriveError,
    InvalidDriveFormatError,
} from "./errors.js";
export { MAX_NVRAMS, NVRAM_ALIGNMENT } from "./limits.js";

/**
 * Resolved configuration of an application. This is the fully normalized and
 * validated shape the rest of the CLI works with, produced from a
 * {@link UserConfig} written in a configuration file of any of the supported
 * formats, or built programmatically.
 */

/**
 * Configuration for drives of a Cartesi Machine. A drive may already exist or be built by a builder
 */
export const DEFAULT_FORMAT = "ext2";
export const DEFAULT_RAM = "128Mi";
export const DEFAULT_SDK_VERSION = "0.12.0-alpha.44";
export const DEFAULT_SDK_IMAGE = "cartesi/sdk";
export const PREFERRED_PORT = 6751;

export type Builder = "directory" | "docker" | "empty" | "none" | "tar";
export type DriveFormat = "ext2" | "sqfs";

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

/**
 * Marks the drive or nvram that holds the accounts of emergency withdrawal, whose layout is
 * derived from the built machine.
 */
export type AccountsDriveMarker = {
    accountsDrive?: boolean; // holds the accounts of emergency withdrawal
    accountsDriveSize?: number; // accounts only in this many bytes at the beginning, default is all of it
};

export type DriveConfig = (
    | DirectoryDriveConfig
    | DockerDriveConfig
    | EmptyDriveConfig
    | ExistingDriveConfig
    | TarDriveConfig
) &
    AccountsDriveMarker & {
        mount?: string | boolean; // default given by cartesi-machine
        shared?: boolean; // default given by cartesi-machine
        user?: string; // default given by cartesi-machine
    };

/**
 * Configuration for an NVRAM of a Cartesi Machine. Unlike a flash drive, an nvram is a raw
 * range of bytes exposed to the guest as a /dev/uio* device, with no filesystem and no mount
 * point. Either `size` or `filename` must be defined.
 */
export type NvramConfig = AccountsDriveMarker & {
    filename?: string; // path to an existing raw image with the initial contents
    size?: number; // in bytes, a positive multiple of 4Ki
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

/**
 * The optional [withdrawal] section of an application with an accounts drive. The accounts
 * drive layout is derived from the built machine; these keys override the defaults.
 */
export type WithdrawalOptions = {
    guardian?: Address; // default is a devnet account
    withdrawal_output_builder?: Address; // default is the devnet TestUsdWithdrawalOutputBuilder
    account_size?: number; // in bytes, default is 32
};

/** Block used by the node when fetching new blocks. */
export type DefaultBlock = "latest" | "safe" | "pending" | "finalized";

export const DEFAULT_BLOCKS: readonly DefaultBlock[] = [
    "latest",
    "safe",
    "pending",
    "finalized",
];

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

export type Config = {
    drives: Record<string, DriveConfig>;
    machine: MachineConfig;
    nvrams: Record<string, NvramConfig>;
    run: RunConfig;
    sdk: string;
    withdrawal?: WithdrawalOptions;
};

export const LOG2_LEAF_SIZE = 5; // accounts are made of 32-byte leaves

/**
 * Number of 32-byte leaves of each account, in log2, from `account_size`. Defaults to one leaf.
 */
export const getLog2LeavesPerAccount = (options?: WithdrawalOptions): number =>
    options?.account_size !== undefined
        ? Math.log2(options.account_size) - LOG2_LEAF_SIZE // a power of two, so exact
        : 0;

/**
 * The drive or nvram marked with `accounts_drive = true`.
 */
export type AccountsDrive = {
    kind: "flash_drive" | "nvram"; // section of the stored machine config that holds it
    label: string;
    config: DriveConfig | NvramConfig; // its entry in cartesi.toml
};

/**
 * Every drive and nvram marked with `accounts_drive = true`. Parsing rejects more than one,
 * and lists them all to say which.
 */
export const getMarkedDrives = (config: Config): AccountsDrive[] =>
    [
        ...Object.entries(config.drives).map(([label, drive]) => ({
            kind: "flash_drive" as const,
            label,
            config: drive,
        })),
        ...Object.entries(config.nvrams).map(([label, nvram]) => ({
            kind: "nvram" as const,
            label,
            config: nvram,
        })),
    ].filter((drive) => drive.config.accountsDrive);

export const getAccountsDrive = (config: Config): AccountsDrive | undefined =>
    getMarkedDrives(config)[0];

/**
 * Splits a number of bytes into the largest IEC unit that divides it exactly, e.g. 4194304 is
 * 4 "Mi", and 1000 is 1000 "".
 */
export const splitSize = (bytes: number): { value: number; unit: string } => {
    let value = bytes;
    let unit = "";
    for (const next of ["Ki", "Mi", "Gi", "Ti"]) {
        if (value === 0 || value % 1024 !== 0) {
            break;
        }
        value /= 1024;
        unit = next;
    }
    return { value, unit };
};

/**
 * Formats a number of bytes as a size cartesi.toml accepts, e.g. "4Mi".
 */
export const formatSize = (bytes: number): string => {
    const { value, unit } = splitSize(bytes);
    return `${value}${unit}`;
};

/**
 * The log2 of a positive power of two, or undefined for any other number. It reads the bits,
 * which is exact for every safe integer, where `&` wraps at 32 bits and Math.log2 rounds near
 * 2^53.
 */
export const log2OfPowerOfTwo = (value: number): number | undefined => {
    const bits = Number.isInteger(value) ? value.toString(2) : "";
    return /^10*$/.test(bits) ? bits.length - 1 : undefined;
};

export const nextPowerOfTwo = (value: number): number =>
    2 ** (value - 1).toString(2).length;

/**
 * Checks the accounts drive can be divided into accounts. The accounts drive is either all of
 * the drive or nvram marked with `accounts_drive = true`, or its first `accounts_drive_size`
 * bytes, the rest being free for other application state.
 * @param driveLength length of the whole drive, if known
 * @returns the length of the accounts drive and its log2, if known
 */
export const assertAccountsDriveLength = (
    config: Config,
    accountsDrive: AccountsDrive,
    driveLength?: number,
): { length: number; log2Length: number } | undefined => {
    const { label } = accountsDrive;
    const { accountsDriveSize } = accountsDrive.config;
    const log2LeavesPerAccount = getLog2LeavesPerAccount(config.withdrawal);
    const length = accountsDriveSize ?? driveLength;
    if (length === undefined) {
        return undefined;
    }

    const log2Length = log2OfPowerOfTwo(length);
    if (log2Length === undefined) {
        const suggestion =
            length > 0 ? `, use "${formatSize(nextPowerOfTwo(length))}"` : "";
        throw new InvalidAccountsDriveError(
            label,
            accountsDriveSize !== undefined
                ? `accounts_drive_size ${length} is not a power of two${suggestion}`
                : `size ${length} is not a power of two${suggestion}, or set accounts_drive_size to keep the accounts at the beginning of a larger drive`,
        );
    }
    const log2AccountSize = LOG2_LEAF_SIZE + log2LeavesPerAccount;
    if (log2Length < log2AccountSize) {
        throw new InvalidAccountsDriveError(
            label,
            `size ${length} is smaller than one account of ${2 ** log2AccountSize} bytes`,
        );
    }
    if (
        accountsDriveSize !== undefined &&
        driveLength !== undefined &&
        accountsDriveSize > driveLength
    ) {
        throw new InvalidAccountsDriveError(
            label,
            `accounts_drive_size ${accountsDriveSize} is larger than the drive itself (${driveLength} bytes)`,
        );
    }
    return { length, log2Length };
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
    nvrams: {},
    run: defaultRunConfig(),
    sdk: `${DEFAULT_SDK_IMAGE}:${DEFAULT_SDK_VERSION}`,
    withdrawal: undefined,
});

/**
 * Filename, relative to the build destination directory, of the image backing an nvram.
 */
export const nvramImageFilename = (label: string): string => `${label}.raw`;

/**
 * Whether an nvram is backed by an image file. A pristine nvram needs no image, as
 * cartesi-machine fills its range with zeros. A `shared` one does, as there must be a file for
 * the guest writes to be persisted to.
 */
export const nvramHasImage = (nvram: NvramConfig): boolean =>
    nvram.filename !== undefined || nvram.shared === true;

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
