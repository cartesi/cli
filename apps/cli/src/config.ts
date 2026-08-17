import bytes from "bytes";
import { extname } from "node:path";
import { parse as parseToml, type TomlPrimitive } from "smol-toml";
import { getAddress, isAddress, isHex, type Address } from "viem";

const NVRAM_ALIGNMENT = 4096; // cartesi-machine requires length % 4Ki == 0
const MAX_NVRAMS = 8; // guest exposes nvrams as /dev/uio0 to /dev/uio7

/**
 * Typed Errors
 */
export class InvalidBuilderError extends Error {
    constructor(builder: TomlPrimitive) {
        super(`Invalid builder: ${builder}`);
        this.name = "InvalidBuilder";
    }
}

export class InvalidDriveFormatError extends Error {
    constructor(format: TomlPrimitive) {
        super(`Invalid drive format: ${format}`);
        this.name = "InvalidDriveFormatError";
    }
}

export class InvalidEmptyDriveFormatError extends Error {
    constructor(format: TomlPrimitive) {
        super(`Invalid empty drive format: ${format}`);
        this.name = "InvalidEmptyDriveFormatError";
    }
}

export class InvalidStringValueError extends Error {
    constructor(value: TomlPrimitive) {
        super(`Invalid string value: ${value}`);
        this.name = "InvalidStringValueError";
    }
}

export class InvalidBooleanValueError extends Error {
    constructor(value: TomlPrimitive) {
        super(`Invalid boolean value: ${value}`);
        this.name = "InvalidBooleanValueError";
    }
}

export class InvalidNumberValueError extends Error {
    constructor(value: TomlPrimitive, key?: string) {
        super(`Invalid number value: ${value}${key ? ` for key: ${key}` : ""}`);
        this.name = "InvalidNumberValueError";
    }
}

export class InvalidAddressValueError extends Error {
    constructor(value: TomlPrimitive, key?: string) {
        super(
            `Invalid address value: ${value}${key ? ` for key: ${key}` : ""}`,
        );
        this.name = "InvalidAddressValueError";
    }
}

export class InvalidBytesValueError extends Error {
    constructor(value: TomlPrimitive) {
        super(`Invalid bytes value: ${value}`);
        this.name = "InvalidBytesValueError";
    }
}

export class RequiredFieldError extends Error {
    constructor(key: TomlPrimitive) {
        super(`Missing required field: ${key}`);
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
        super(`Invalid env configuration: ${value}`);
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

/**
 * Configuration for drives of a Cartesi Machine. A drive may already exist or be built by a builder
 */
const DEFAULT_FORMAT = "ext2";
const DEFAULT_RAM = "128Mi";
export const DEFAULT_SDK_VERSION = "0.12.0-alpha.41";
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

/**
 * Configuration for an NVRAM of a Cartesi Machine. Unlike a flash drive, an nvram is a raw
 * range of bytes exposed to the guest as a /dev/uio* device, with no filesystem and no mount
 * point. Either `size` or `filename` must be defined.
 */
export type NvramConfig = {
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

export type Config = {
    drives: Record<string, DriveConfig>;
    machine: MachineConfig;
    nvrams: Record<string, NvramConfig>;
    sdk: string;
    withdrawalConfig?: WithdrawalConfig;
};

type TomlTable = { [key: string]: TomlPrimitive };

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

export const defaultConfig = (): Config => ({
    drives: { root: defaultRootDriveConfig() },
    machine: defaultMachineConfig(),
    nvrams: {},
    sdk: `${DEFAULT_SDK_IMAGE}:${DEFAULT_SDK_VERSION}`,
    withdrawalConfig: undefined,
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

const parseRequiredNumber = (value: TomlPrimitive, key: string): number => {
    if (value === undefined) {
        throw new RequiredFieldError(key);
    }

    if (typeof value === "number") {
        return value;
    }

    const val =
        typeof value === "string" && isHex(value) ? parseInt(value, 16) : null;

    if (val !== null && !Number.isNaN(val)) {
        return val;
    }

    throw new InvalidNumberValueError(value, key);
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

const parseBytes = (value: TomlPrimitive, defaultValue: number): number => {
    if (value === undefined) {
        return defaultValue;
    }
    if (typeof value === "bigint") {
        return Number(value);
    }
    if (typeof value === "number" || typeof value === "string") {
        const output = bytes.parse(value);
        if (output !== null) {
            return output;
        }
    }
    throw new InvalidBytesValueError(value);
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
};

/**
 * Parses a byte size, accepting both the IEC suffixes used by cartesi-machine ("4Ki", "1MiB")
 * and the ones understood by the `bytes` package ("4kb", "100Mb"). Not to be confused with
 * `parseBytes`, which delegates to `bytes.parse` and reads "4Ki" as 4 bytes.
 */
const parseNvramSize = (value: TomlPrimitive): number | undefined => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "bigint") {
        return Number(value);
    }
    if (typeof value === "number") {
        return value;
    }
    if (typeof value === "string") {
        const match = /^\s*(\d+(?:\.\d+)?)\s*([a-z]*)\s*$/i.exec(value);
        const multiplier = match
            ? IEC_MULTIPLIERS[match[2].toLowerCase()]
            : undefined;
        if (match && multiplier !== undefined) {
            return Number(match[1]) * multiplier;
        }
    }
    throw new InvalidBytesValueError(value);
};

const parseNvram = (label: string, value: TomlPrimitive): NvramConfig => {
    const toml = isTomlTable(value) ? value : {};
    const size = parseNvramSize(toml.size);
    const filename = parseOptionalString(toml.filename);

    if (size === undefined && filename === undefined) {
        throw new MissingNvramSourceError(label);
    }
    if (size !== undefined && (size <= 0 || size % NVRAM_ALIGNMENT !== 0)) {
        throw new InvalidNvramSizeError(label, size);
    }

    return {
        filename,
        size,
        shared: parseOptionalBoolean(toml.shared),
        user: parseOptionalString(toml.user),
    };
};

const parseNvrams = (config: TomlPrimitive): Record<string, NvramConfig> => {
    const entries = Object.entries((config as TomlTable) ?? {});
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

const parseMachine = (value: TomlPrimitive): MachineConfig => {
    if (value === undefined) {
        // default machine
        return defaultMachineConfig();
    }
    if (typeof value !== "object") {
        throw new Error(`Invalid machine configuration: ${value}`);
    }
    const toml = value as TomlTable;

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

const parseDrive = (drive: TomlPrimitive): DriveConfig => {
    const builder = parseBuilder((drive as TomlTable).builder);
    switch (builder) {
        case "directory": {
            const { extra_size, format, mount, directory, shared, user } =
                drive as TomlTable;
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
            } = drive as TomlTable;
            return {
                builder: "docker",
                buildArgs: parseStringArray(build_args),
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
            const { format, mount, size, shared, user } = drive as TomlTable;
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
            const { extra_size, filename, format, mount, shared, user } =
                drive as TomlTable;
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
            const { shared, mount, user } = drive as TomlTable;
            const filename = parseRequiredString(
                (drive as TomlTable).filename,
                "filename",
            );
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
    // load drives from configuration
    const drives = Object.entries((config as TomlTable) ?? {}).reduce<
        Record<string, DriveConfig>
    >((acc, [name, drive]) => {
        acc[name] = parseDrive(drive);
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

const parseWithdrawalConfig = (config: TomlTable): WithdrawalConfig => {
    return {
        guardian: parseRequiredAddress(config.guardian, "guardian"),
        log2_leaves_per_account: parseRequiredNumber(
            config.log2_leaves_per_account,
            "log2_leaves_per_account",
        ),
        log2_max_num_of_accounts: parseRequiredNumber(
            config.log2_max_num_of_accounts,
            "log2_max_num_of_accounts",
        ),
        accounts_drive_start_index: parseRequiredNumber(
            config.accounts_drive_start_index,
            "accounts_drive_start_index",
        ),
        withdrawal_output_builder: parseRequiredAddress(
            config.withdrawal_output_builder,
            "withdrawal_output_builder",
        ),
    };
};

const parseOptionalWithdrawalConfig = (
    withdrawal: TomlPrimitive,
): WithdrawalConfig | undefined => {
    if (withdrawal === undefined) {
        return undefined;
    }

    const config = (withdrawal as TomlTable).config;

    const isNotDefined =
        config === undefined ||
        config === null ||
        Object.keys(config).length === 0;

    if (isNotDefined) {
        return undefined;
    }

    return parseWithdrawalConfig(config as TomlTable);
};

export const parse = (str: string[]): Config => {
    let toml: TomlTable = {};
    for (const s of str) {
        toml = mergeTomlTables(toml, parseToml(s));
    }

    const drives = parseDrives(toml.drives);
    const nvrams = parseNvrams(toml.nvrams);

    // drives and nvrams share the DTB /aliases namespace, so labels cannot collide
    for (const label of Object.keys(nvrams)) {
        if (drives[label] !== undefined) {
            throw new DuplicateLabelError(label);
        }
    }

    const config: Config = {
        withdrawalConfig: parseOptionalWithdrawalConfig(toml.withdrawal),
        drives,
        machine: parseMachine(toml.machine),
        nvrams,
        sdk: parseString(
            toml.sdk,
            `${DEFAULT_SDK_IMAGE}:${DEFAULT_SDK_VERSION}`,
        ),
    };

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
