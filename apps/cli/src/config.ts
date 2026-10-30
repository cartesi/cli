import { extname } from "node:path";
import { parse as parseToml, type TomlPrimitive } from "smol-toml";
import { getAddress, isAddress, type Address } from "viem";

export const NVRAM_ALIGNMENT = 4096; // cartesi-machine requires length % 4Ki == 0
const MAX_NVRAMS = 8; // guest exposes nvrams as /dev/uio0 to /dev/uio7

/**
 * Typed Errors
 */

// smol-toml creates tables with a null prototype, which can't be coerced to a
// string by template literals, so format objects (tables, arrays) as JSON.
const formatValue = (value: TomlPrimitive): string =>
    typeof value === "object" && value !== null && !(value instanceof Date)
        ? JSON.stringify(value, (_, v) =>
              typeof v === "bigint" ? v.toString() : v,
          )
        : String(value);

export class InvalidBuilderError extends Error {
    constructor(builder: TomlPrimitive) {
        super(`Invalid builder: ${formatValue(builder)}`);
        this.name = "InvalidBuilder";
    }
}

export class InvalidDriveFormatError extends Error {
    constructor(format: TomlPrimitive) {
        super(`Invalid drive format: ${formatValue(format)}`);
        this.name = "InvalidDriveFormatError";
    }
}

export class InvalidEmptyDriveFormatError extends Error {
    constructor(format: TomlPrimitive) {
        super(`Invalid empty drive format: ${formatValue(format)}`);
        this.name = "InvalidEmptyDriveFormatError";
    }
}

export class InvalidStringValueError extends Error {
    constructor(value: TomlPrimitive) {
        super(`Invalid string value: ${formatValue(value)}`);
        this.name = "InvalidStringValueError";
    }
}

export class InvalidBooleanValueError extends Error {
    constructor(value: TomlPrimitive) {
        super(`Invalid boolean value: ${formatValue(value)}`);
        this.name = "InvalidBooleanValueError";
    }
}

export class InvalidNumberValueError extends Error {
    constructor(value: TomlPrimitive, key?: string) {
        super(
            `Invalid number value: ${formatValue(value)}${key ? ` for key: ${key}` : ""}`,
        );
        this.name = "InvalidNumberValueError";
    }
}

export class InvalidAddressValueError extends Error {
    constructor(value: TomlPrimitive, key?: string) {
        super(
            `Invalid address value: ${formatValue(value)}${key ? ` for key: ${key}` : ""}`,
        );
        this.name = "InvalidAddressValueError";
    }
}

export class InvalidBytesValueError extends Error {
    constructor(value: TomlPrimitive) {
        super(`Invalid bytes value: ${formatValue(value)}`);
        this.name = "InvalidBytesValueError";
    }
}

export class RequiredFieldError extends Error {
    constructor(key: TomlPrimitive) {
        super(`Missing required field: ${formatValue(key)}`);
        this.name = "RequiredFieldError";
    }
}

export class InvalidStringArrayError extends Error {
    constructor() {
        super("Invalid string array");
        this.name = "InvalidStringArrayError";
    }
}

export class InvalidEnvError extends Error {
    constructor(value: TomlPrimitive) {
        super(`Invalid env configuration: ${formatValue(value)}`);
        this.name = "InvalidEnvError";
    }
}

export class MissingNvramSourceError extends Error {
    constructor(label: string) {
        super(`Nvram '${label}' must define either 'size' or 'filename'`);
        this.name = "MissingNvramSourceError";
    }
}

export class InvalidNvramSizeError extends Error {
    constructor(label: string, size: number) {
        super(
            `Invalid size ${size} for nvram '${label}': must be a positive multiple of ${NVRAM_ALIGNMENT}`,
        );
        this.name = "InvalidNvramSizeError";
    }
}

export class TooManyNvramsError extends Error {
    constructor(count: number) {
        super(`Too many nvrams: ${count}, maximum is ${MAX_NVRAMS}`);
        this.name = "TooManyNvramsError";
    }
}

export class DuplicateLabelError extends Error {
    constructor(label: string) {
        super(`Label '${label}' is used by both a drive and an nvram`);
        this.name = "DuplicateLabelError";
    }
}

export class MultipleAccountsDrivesError extends Error {
    constructor(labels: string[]) {
        super(
            `Only one drive or nvram can be the accounts drive, but ${labels.map((label) => `'${label}'`).join(", ")} are marked with accounts_drive = true`,
        );
        this.name = "MultipleAccountsDrivesError";
    }
}

export class InvalidAccountsDriveError extends Error {
    constructor(label: string, reason: string) {
        super(`Invalid accounts drive '${label}': ${reason}`);
        this.name = "InvalidAccountsDriveError";
    }
}

export class InvalidWithdrawalConfigError extends Error {
    constructor(reason: string) {
        super(`Invalid [withdrawal]: ${reason}`);
        this.name = "InvalidWithdrawalConfigError";
    }
}

export class UnknownConfigKeyError extends Error {
    /**
     * @param where where the keys are, e.g. "in [machine]" or "at the top level"
     */
    constructor(keys: string[], known: readonly string[], where: string) {
        const list = keys.map((key) => `'${key}'`).join(", ");
        super(
            `Unknown ${keys.length > 1 ? "keys" : "key"} ${list} ${where}, expected one of: ${[...known].sort().join(", ")}`,
        );
        this.name = "UnknownConfigKeyError";
    }
}

export class InvalidTableError extends Error {
    constructor(location: string, value: TomlPrimitive) {
        super(
            `Invalid ${location}: expected a table, got ${formatValue(value)}`,
        );
        this.name = "InvalidTableError";
    }
}

/**
 * Configuration for drives of a Cartesi Machine. A drive may already exist or be built by a builder
 */
const DEFAULT_FORMAT = "ext2";
const DEFAULT_RAM = "128Mi";
export const DEFAULT_SDK_VERSION = "0.12.0-alpha.44";
export const DEFAULT_SDK_IMAGE = "cartesi/sdk";
export const PREFERRED_PORT = 6751;

type Builder = "directory" | "docker" | "empty" | "none" | "tar";
type DriveFormat = "ext2" | "sqfs";

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
    cacheFrom: string[]; // default is empty array
    cacheTo: string[]; // default is empty array
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
type AccountsDriveMarker = {
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

export type Config = {
    drives: Record<string, DriveConfig>;
    machine: MachineConfig;
    nvrams: Record<string, NvramConfig>;
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
const getMarkedDrives = (config: Config): AccountsDrive[] =>
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
const formatSize = (bytes: number): string => {
    const { value, unit } = splitSize(bytes);
    return `${value}${unit}`;
};

/**
 * The log2 of a positive power of two, or undefined for any other number. It reads the bits,
 * which is exact for every safe integer, where `&` wraps at 32 bits and Math.log2 rounds near
 * 2^53.
 */
const log2OfPowerOfTwo = (value: number): number | undefined => {
    const bits = Number.isInteger(value) ? value.toString(2) : "";
    return /^10*$/.test(bits) ? bits.length - 1 : undefined;
};

const nextPowerOfTwo = (value: number): number =>
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

type TomlTable = { [key: string]: TomlPrimitive };

/**
 * Fails on any key of a table that its parser doesn't read, naming the keys the table accepts.
 * @param where where the table is, e.g. "in [machine]" or "at the top level"
 */
const assertKnownKeys = (
    table: TomlTable,
    known: readonly string[],
    where: string,
): void => {
    const unknown = Object.keys(table).filter((key) => !known.includes(key));
    if (unknown.length > 0) {
        throw new UnknownConfigKeyError(unknown, known, where);
    }
};

export const defaultRootDriveConfig = (): DriveConfig => ({
    builder: "docker",
    buildArgs: [],
    cacheFrom: [],
    cacheTo: [],
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

export const defaultConfig = (): Config => ({
    drives: { root: defaultRootDriveConfig() },
    machine: defaultMachineConfig(),
    nvrams: {},
    sdk: `${DEFAULT_SDK_IMAGE}:${DEFAULT_SDK_VERSION}`,
    withdrawal: undefined,
});

const parseBoolean = (value: TomlPrimitive, defaultValue: boolean): boolean => {
    if (value === undefined) {
        return defaultValue;
    }
    if (typeof value === "boolean") {
        return value;
    }
    throw new InvalidBooleanValueError(value);
};

const parseOptionalBoolean = (value: TomlPrimitive): boolean | undefined => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "boolean") {
        return value;
    }
    throw new InvalidBooleanValueError(value);
};

const parseString = (value: TomlPrimitive, defaultValue: string): string => {
    if (value === undefined) {
        return defaultValue;
    }
    if (typeof value === "string") {
        return value;
    }
    throw new InvalidStringValueError(value);
};

const parseStringArray = (value: TomlPrimitive): string[] => {
    if (value === undefined) {
        return [];
    }
    if (typeof value === "string") {
        return [value];
    }
    if (typeof value === "object" && Array.isArray(value)) {
        return value.map((v) => {
            if (typeof v === "string") {
                return v;
            }
            throw new InvalidStringValueError(v);
        });
    }
    throw new InvalidStringArrayError();
};

/**
 * Parses a TOML table into a record of string environment variables.
 * Non-string scalar values (number, bigint, boolean) are coerced to string,
 * since environment variable values are always strings.
 */
const parseStringRecord = (value: TomlPrimitive): Record<string, string> => {
    if (value === undefined) {
        return {};
    }
    if (!isTomlTable(value)) {
        throw new InvalidEnvError(value);
    }
    return Object.entries(value).reduce<Record<string, string>>(
        (acc, [key, val]) => {
            if (typeof val === "string") {
                acc[key] = val;
            } else if (
                typeof val === "number" ||
                typeof val === "bigint" ||
                typeof val === "boolean"
            ) {
                acc[key] = String(val);
            } else {
                throw new InvalidStringValueError(val);
            }
            return acc;
        },
        {},
    );
};

const parseRequiredString = (value: TomlPrimitive, key: string): string => {
    if (value === undefined) {
        throw new RequiredFieldError(key);
    }
    if (typeof value === "string") {
        return value;
    }
    throw new InvalidStringValueError(value);
};

const parseRequiredAddress = (value: TomlPrimitive, key: string): Address => {
    if (value === undefined) {
        throw new RequiredFieldError(key);
    }
    if (typeof value === "string" && isAddress(value)) {
        return getAddress(value);
    }
    throw new InvalidAddressValueError(value, key);
};

const parseOptionalString = (value: TomlPrimitive): string | undefined => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "string") {
        return value;
    }
    throw new InvalidStringValueError(value);
};

const parseOptionalStringBoolean = (
    value: TomlPrimitive,
): string | boolean | undefined => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "boolean") {
        return value;
    }
    throw new InvalidStringValueError(value);
};

const parseOptionalNumber = (value: TomlPrimitive): bigint | undefined => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "bigint") {
        return value;
    }
    if (typeof value === "number") {
        return BigInt(value);
    }
    throw new InvalidNumberValueError(value);
};

const IEC_MULTIPLIERS: Record<string, number> = {
    "": 1,
    b: 1,
    k: 1024,
    ki: 1024,
    kb: 1024,
    kib: 1024,
    m: 1024 ** 2,
    mi: 1024 ** 2,
    mb: 1024 ** 2,
    mib: 1024 ** 2,
    g: 1024 ** 3,
    gi: 1024 ** 3,
    gb: 1024 ** 3,
    gib: 1024 ** 3,
    t: 1024 ** 4,
    ti: 1024 ** 4,
    tb: 1024 ** 4,
    tib: 1024 ** 4,
    p: 1024 ** 5,
    pi: 1024 ** 5,
    pb: 1024 ** 5,
    pib: 1024 ** 5,
};

/**
 * Parses a byte size of a drive or nvram, accepting the IEC suffixes used by cartesi-machine
 * ("4Ki", "1MiB") and their decimal spellings ("4kb", "100Mb"), all as powers of 1024, up to
 * petabytes. Sizes are numbers, so the ones beyond 2^53 bytes, which they can't hold exactly,
 * are rejected.
 */
const parseSize = (value: TomlPrimitive): number | undefined => {
    if (value === undefined) {
        return undefined;
    }
    let size: number | undefined;
    if (typeof value === "number") {
        size = value;
    } else if (typeof value === "string") {
        const match = /^\s*(\d+(?:\.\d+)?)\s*([a-z]*)\s*$/i.exec(value);
        const multiplier = match
            ? IEC_MULTIPLIERS[match[2].toLowerCase()]
            : undefined;
        if (match && multiplier !== undefined) {
            size = Number(match[1]) * multiplier;
        }
    }
    // a whole number of bytes, e.g. "1.5Ki" is but "1.1Ki" isn't
    if (
        size !== undefined &&
        Number.isInteger(size) &&
        size <= Number.MAX_SAFE_INTEGER
    ) {
        return size;
    }
    throw new InvalidBytesValueError(value);
};

const parseBytes = (value: TomlPrimitive, defaultValue: number): number =>
    parseSize(value) ?? defaultValue;

const ACCOUNTS_DRIVE_KEYS: readonly string[] = [
    "accounts_drive",
    "accounts_drive_size",
];

/**
 * Parses the keys that mark a drive or nvram as the accounts drive, leaving them out when unset.
 */
const parseAccountsDriveMarker = (toml: TomlTable): AccountsDriveMarker => {
    const accountsDrive = parseOptionalBoolean(toml.accounts_drive);
    const accountsDriveSize = parseSize(toml.accounts_drive_size);
    return {
        ...(accountsDrive !== undefined && { accountsDrive }),
        ...(accountsDriveSize !== undefined && { accountsDriveSize }),
    };
};

const NVRAM_KEYS: readonly string[] = [
    ...ACCOUNTS_DRIVE_KEYS,
    "filename",
    "shared",
    "size",
    "user",
];

const parseNvram = (label: string, value: TomlPrimitive): NvramConfig => {
    if (!isTomlTable(value)) {
        throw new InvalidTableError(`[nvrams.${label}]`, value);
    }
    const toml = value;
    assertKnownKeys(toml, NVRAM_KEYS, `in [nvrams.${label}]`);
    const size = parseSize(toml.size);
    const filename = parseOptionalString(toml.filename);

    if (size === undefined && filename === undefined) {
        throw new MissingNvramSourceError(label);
    }
    if (size !== undefined && (size <= 0 || size % NVRAM_ALIGNMENT !== 0)) {
        throw new InvalidNvramSizeError(label, size);
    }

    return {
        ...parseAccountsDriveMarker(toml),
        filename,
        size,
        shared: parseOptionalBoolean(toml.shared),
        user: parseOptionalString(toml.user),
    };
};

const parseNvrams = (config: TomlPrimitive): Record<string, NvramConfig> => {
    if (config !== undefined && !isTomlTable(config)) {
        throw new InvalidTableError("[nvrams]", config);
    }
    const entries = Object.entries(config ?? {});
    if (entries.length > MAX_NVRAMS) {
        throw new TooManyNvramsError(entries.length);
    }
    return entries.reduce<Record<string, NvramConfig>>(
        (acc, [label, nvram]) => {
            acc[label] = parseNvram(label, nvram);
            return acc;
        },
        {},
    );
};

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

const parseBuilder = (value: TomlPrimitive): Builder => {
    if (value === undefined) {
        return "docker";
    }
    if (typeof value === "string") {
        switch (value) {
            case "directory":
                return "directory";
            case "docker":
                return "docker";
            case "empty":
                return "empty";
            case "none":
                return "none";
            case "tar":
                return "tar";
        }
    }
    throw new InvalidBuilderError(value);
};

const parseFormat = (value: TomlPrimitive): DriveFormat => {
    if (value === undefined) {
        return DEFAULT_FORMAT;
    }
    if (typeof value === "string") {
        switch (value) {
            case "ext2":
                return "ext2";
            case "sqfs":
                return "sqfs";
        }
    }
    throw new InvalidDriveFormatError(value);
};

const parseEmptyFormat = (value: TomlPrimitive): "ext2" | "raw" => {
    if (value === undefined) {
        return DEFAULT_FORMAT;
    }
    if (typeof value === "string") {
        switch (value) {
            case "ext2":
                return "ext2";
            case "raw":
                return "raw";
        }
    }
    throw new InvalidEmptyDriveFormatError(value);
};

const MACHINE_KEYS: readonly string[] = [
    "assert_rolling_template",
    "boot_args",
    "entrypoint",
    "env",
    "env_file",
    "max_mcycle",
    "ram_image",
    "ram_length",
    "use_docker_env",
    "use_docker_workdir",
    "user",
];

const parseMachine = (value: TomlPrimitive): MachineConfig => {
    if (value === undefined) {
        // default machine
        return defaultMachineConfig();
    }
    if (!isTomlTable(value)) {
        throw new InvalidTableError("[machine]", value);
    }
    assertKnownKeys(value, MACHINE_KEYS, "in [machine]");
    const toml = value;

    return {
        assertRollingTemplate: parseOptionalBoolean(
            toml.assert_rolling_template,
        ),
        bootargs: parseStringArray(toml.boot_args),
        entrypoint: parseOptionalString(toml.entrypoint),
        env: parseStringRecord(toml.env),
        envFile: parseOptionalString(toml.env_file),
        maxMCycle: parseOptionalNumber(toml.max_mcycle),
        ramLength: parseString(toml.ram_length, DEFAULT_RAM),
        ramImage: parseOptionalString(toml.ram_image),
        useDockerEnv: parseBoolean(toml.use_docker_env, true),
        useDockerWorkdir: parseBoolean(toml.use_docker_workdir, true),
        user: parseOptionalString(toml.user),
    };
};

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

const DRIVE_KEYS: readonly string[] = [
    ...ACCOUNTS_DRIVE_KEYS,
    "builder",
    "mount",
    "shared",
    "user",
];

/**
 * The keys each builder reads, on top of DRIVE_KEYS
 */
const BUILDER_KEYS: Record<Builder, readonly string[]> = {
    directory: ["directory", "extra_size", "format"],
    docker: [
        "build_args",
        "context",
        "dockerfile",
        "extra_size",
        "format",
        "image",
        "tags",
        "target",
    ],
    empty: ["format", "size"],
    none: ["filename"],
    tar: ["extra_size", "filename", "format"],
};

const parseDrive = (name: string, drive: TomlPrimitive): DriveConfig => {
    if (!isTomlTable(drive)) {
        throw new InvalidTableError(`[drives.${name}]`, drive);
    }
    const toml = drive;
    // the keys depend on the builder, so an invalid one is reported first
    const builder = parseBuilder(toml.builder);
    const implicit = toml.builder === undefined ? " by default" : "";
    assertKnownKeys(
        toml,
        [...DRIVE_KEYS, ...BUILDER_KEYS[builder]],
        `in [drives.${name}] (builder = "${builder}"${implicit})`,
    );
    return {
        ...parseBuilderDrive(builder, toml),
        ...parseAccountsDriveMarker(toml),
    };
};

const parseBuilderDrive = (builder: Builder, drive: TomlTable): DriveConfig => {
    switch (builder) {
        case "directory": {
            const { extra_size, format, mount, directory, shared, user } =
                drive;
            return {
                builder: "directory",
                extraSize: parseBytes(extra_size, 0),
                format: parseFormat(format),
                mount: parseOptionalStringBoolean(mount),
                directory: parseRequiredString(directory, "directory"),
                shared: parseOptionalBoolean(shared),
                user: parseOptionalString(user),
            };
        }
        case "docker": {
            const {
                build_args,
                cache_from,
                cache_to,
                context,
                dockerfile,
                extra_size,
                format,
                image,
                mount,
                shared,
                tags,
                target,
                user,
            } = drive;
            return {
                builder: "docker",
                buildArgs: parseStringArray(build_args),
                cacheFrom: parseStringArray(cache_from),
                cacheTo: parseStringArray(cache_to),
                image: parseOptionalString(image),
                context: parseString(context, "."),
                dockerfile: parseString(dockerfile, "Dockerfile"),
                extraSize: parseBytes(extra_size, 0),
                format: parseFormat(format),
                mount: parseOptionalStringBoolean(mount),
                shared: parseOptionalBoolean(shared),
                user: parseOptionalString(user),
                tags: parseStringArray(tags),
                target: parseOptionalString(target),
            };
        }
        case "empty": {
            const { format, mount, size, shared, user } = drive;
            return {
                builder: "empty",
                format: parseEmptyFormat(format),
                mount: parseOptionalStringBoolean(mount),
                shared: parseOptionalBoolean(shared),
                size: parseBytes(size, 0),
                user: parseOptionalString(user),
            };
        }
        case "tar": {
            const { extra_size, filename, format, mount, shared, user } = drive;
            return {
                builder: "tar",
                extraSize: parseBytes(extra_size, 0),
                filename: parseRequiredString(filename, "filename"),
                format: parseFormat(format),
                mount: parseOptionalStringBoolean(mount),
                shared: parseOptionalBoolean(shared),
                user: parseOptionalString(user),
            };
        }
        case "none": {
            const { shared, mount, user } = drive;
            const filename = parseRequiredString(drive.filename, "filename");
            const format = getDriveFormat(filename);
            return {
                builder: "none",
                filename,
                format,
                mount: parseOptionalStringBoolean(mount),
                shared: parseOptionalBoolean(shared),
                user: parseOptionalString(user),
            };
        }
    }
};

const parseDrives = (config: TomlPrimitive): Record<string, DriveConfig> => {
    if (config !== undefined && !isTomlTable(config)) {
        throw new InvalidTableError("[drives]", config);
    }
    // load drives from configuration
    const drives = Object.entries(config ?? {}).reduce<
        Record<string, DriveConfig>
    >((acc, [name, drive]) => {
        acc[name] = parseDrive(name, drive);
        return acc;
    }, {});

    // check if there is a root drive
    const hasRoot = drives.root !== undefined;
    if (!hasRoot) {
        // there is no root drive, add a default one
        drives.root = defaultRootDriveConfig();
    }
    return drives;
};

const parseAccountSize = (value: TomlPrimitive): number => {
    const size = parseSize(value);
    if (
        size === undefined ||
        size < 2 ** LOG2_LEAF_SIZE ||
        log2OfPowerOfTwo(size) === undefined
    ) {
        throw new InvalidWithdrawalConfigError(
            `account_size ${formatValue(value)} must be a power of two of at least 32 bytes, such as 32 or 64`,
        );
    }
    return size;
};

const WITHDRAWAL_KEYS: readonly string[] = [
    "account_size",
    "guardian",
    "withdrawal_output_builder",
];

/**
 * Parses [withdrawal], which only applies to an application with an accounts drive. Like the
 * other tables, it reads the keys it uses and rejects any other.
 */
const parseOptionalWithdrawal = (
    withdrawal: TomlPrimitive,
): WithdrawalOptions | undefined => {
    if (withdrawal === undefined) {
        return undefined;
    }
    if (!isTomlTable(withdrawal)) {
        throw new InvalidTableError("[withdrawal]", withdrawal);
    }
    assertKnownKeys(withdrawal, WITHDRAWAL_KEYS, "in [withdrawal]");

    const optional = <T>(
        key: string,
        parser: (value: TomlPrimitive, key: string) => T,
    ): T | undefined =>
        withdrawal[key] === undefined
            ? undefined
            : parser(withdrawal[key], key);

    const options: WithdrawalOptions = {
        guardian: optional("guardian", parseRequiredAddress),
        withdrawal_output_builder: optional(
            "withdrawal_output_builder",
            parseRequiredAddress,
        ),
        account_size: optional("account_size", parseAccountSize),
    };
    return options;
};

/**
 * Checks what can be known about the accounts drive before the machine is built. Its placement
 * is only known after, see `resolveAccountsDriveLayout`.
 */
const assertAccountsDrive = (config: Config) => {
    const marked = getMarkedDrives(config);
    if (marked.length > 1) {
        throw new MultipleAccountsDrivesError(marked.map(({ label }) => label));
    }

    for (const [label, drive] of [
        ...Object.entries(config.drives),
        ...Object.entries(config.nvrams),
    ]) {
        if (drive.accountsDriveSize !== undefined && !drive.accountsDrive) {
            throw new InvalidAccountsDriveError(
                label,
                "accounts_drive_size requires accounts_drive = true",
            );
        }
    }

    const [accountsDrive] = marked;
    if (!accountsDrive) {
        if (config.withdrawal) {
            throw new InvalidWithdrawalConfigError(
                "emergency withdrawal needs an accounts drive, mark a raw drive or an nvram with accounts_drive = true",
            );
        }
        return;
    }

    const { label } = accountsDrive;

    let size: number | undefined;
    if (accountsDrive.kind === "flash_drive") {
        const drive = config.drives[label];
        if (drive.builder !== "empty" || drive.format !== "raw") {
            throw new InvalidAccountsDriveError(
                label,
                `it must not have a filesystem, use builder = "empty" and format = "raw", or declare it under [nvrams.${label}]`,
            );
        }
        if (drive.mount !== undefined && drive.mount !== false) {
            throw new InvalidAccountsDriveError(
                label,
                "it can't be mounted, remove 'mount' or set it to false",
            );
        }
        size = drive.size;
    } else {
        // the size of an nvram backed by an existing image is only known once built
        size = config.nvrams[label].size;
    }

    assertAccountsDriveLength(config, accountsDrive, size);
};

const CONFIG_KEYS: readonly string[] = [
    "drives",
    "machine",
    "nvrams",
    "sdk",
    "withdrawal",
];

export const parse = (str: string[]): Config => {
    let toml: TomlTable = {};
    for (const s of str) {
        toml = mergeTomlTables(toml, parseToml(s));
    }
    assertKnownKeys(toml, CONFIG_KEYS, "at the top level");

    const drives = parseDrives(toml.drives);
    const nvrams = parseNvrams(toml.nvrams);

    // drives and nvrams share the DTB /aliases namespace, so labels cannot collide
    for (const label of Object.keys(nvrams)) {
        if (drives[label] !== undefined) {
            throw new DuplicateLabelError(label);
        }
    }

    const config: Config = {
        withdrawal: parseOptionalWithdrawal(toml.withdrawal),
        drives,
        machine: parseMachine(toml.machine),
        nvrams,
        sdk: parseString(
            toml.sdk,
            `${DEFAULT_SDK_IMAGE}:${DEFAULT_SDK_VERSION}`,
        ),
    };

    assertAccountsDrive(config);

    return config;
};

/**
 * Checks if a value is a plain object (TOML table)
 */
function isTomlTable(value: TomlPrimitive): value is TomlTable {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        !("toISOString" in value)
    ); // Check for TomlDate (has toISOString method)
}

/**
 * Recursively merges two TOML table objects
 * Values from 'other' take precedence over 'base'
 *
 * @param base - The base TOML table
 * @param other - The TOML table to merge into base (takes precedence)
 * @returns A new merged TOML table
 */
export function mergeTomlTables(base: TomlTable, other: TomlTable): TomlTable {
    const result: TomlTable = { ...base };

    for (const [key, otherValue] of Object.entries(other)) {
        const baseValue = result[key];

        // If both values are tables, merge them recursively
        if (isTomlTable(baseValue) && isTomlTable(otherValue)) {
            result[key] = mergeTomlTables(baseValue, otherValue);
        } else {
            // For all other cases, other value takes precedence
            result[key] = otherValue;
        }
    }

    return result;
}

/**
 * Merges two TOML values of any type
 *
 * @param base - The base TOML value
 * @param other - The TOML value to merge into base (takes precedence)
 * @returns The merged TOML value
 */
export function mergeTomlValues(
    base: TomlPrimitive,
    other: TomlPrimitive,
): TomlPrimitive {
    // If both are tables, merge recursively
    if (isTomlTable(base) && isTomlTable(other)) {
        return mergeTomlTables(base, other);
    }

    // For arrays, replaces entirely
    return other;
}
