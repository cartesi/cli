import type { Address } from "viem";

/**
 * Configuration for drives of a Cartesi Machine. A drive may already exist or be built by a builder
 */
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

/**
 * The node the CLI runs for a [prt.nodes.<label>] entry. Only the Dave sling node exists
 * today; a type is added once a released node can take a PRT role.
 */
export type PrtNodeType = "sling";

/**
 * What a [prt.nodes.<label>] entry does. A claimer is the PRT participant: it joins
 * tournaments, stages and accepts results and recovers bonds, and the rollups-node then runs
 * in reader mode. A sentry holds a slot on the application's DaveConsensus and submits a
 * sentry claim per epoch.
 */
export type PrtNodeRole = "claimer" | "sentry";

/**
 * One [prt.nodes.<label>] entry. The label is the key and names the container. With a `type`
 * the CLI runs a node for it; without one it is appointed only.
 */
export type PrtNode = {
    type?: PrtNodeType;
    role: PrtNodeRole; // required: the roles differ in funding, reserved accounts and the node's mode
    address?: Address; // required without a type; with one, the PRT pool by default
    privateKeyFile?: string; // the entry's own key, for a type the CLI runs; sets the address
};

/**
 * The optional [prt] section, used by `cartesi run --prt` to deploy the application's
 * DaveConsensus with sentries.
 */
export type PrtOptions = {
    sentryManager?: Address; // may rotate sentries, default is none
    nodes: Record<string, PrtNode>; // in file order, which sets sentry IDs and pool accounts
};

export type Config = {
    drives: Record<string, DriveConfig>;
    machine: MachineConfig;
    nvrams: Record<string, NvramConfig>;
    prt?: PrtOptions;
    sdk: string;
    withdrawal?: WithdrawalOptions;
};
