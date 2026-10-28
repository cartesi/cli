import { extname } from "node:path";
import { parse as parseToml, type TomlPrimitive } from "smol-toml";
import { type Address, getAddress, isAddress } from "viem";
import {
    DEFAULT_FORMAT,
    DEFAULT_RAM,
    DEFAULT_SDK_IMAGE,
    DEFAULT_SDK_VERSION,
    MAX_NVRAMS,
    NVRAM_ALIGNMENT,
} from "./config/constants.js";
import {
    assertAccountsDrive,
    LOG2_LEAF_SIZE,
    log2OfPowerOfTwo,
} from "./config/accounts.js";
import {
    DuplicateLabelError,
    InvalidAddressValueError,
    InvalidBooleanValueError,
    InvalidBuilderError,
    InvalidBytesValueError,
    InvalidDriveFormatError,
    InvalidEmptyDriveFormatError,
    InvalidEnvError,
    InvalidNumberValueError,
    InvalidNvramSizeError,
    InvalidStringArrayError,
    InvalidStringValueError,
    InvalidTableError,
    InvalidWithdrawalConfigError,
    MissingNvramSourceError,
    RequiredFieldError,
    TooManyNvramsError,
    formatValue,
} from "./config/errors.js";
import {
    assertKnownKeys,
    isTomlTable,
    mergeTomlTables,
    type TomlTable,
} from "./config/toml.js";
import type {
    AccountsDriveMarker,
    Builder,
    Config,
    DriveConfig,
    DriveFormat,
    MachineConfig,
    NvramConfig,
    WithdrawalOptions,
} from "./config/types.js";

export {
    DEFAULT_SDK_IMAGE,
    DEFAULT_SDK_VERSION,
    NVRAM_ALIGNMENT,
    PREFERRED_PORT,
} from "./config/constants.js";
export {
    type AccountsDrive,
    assertAccountsDriveLength,
    getAccountsDrive,
    getLog2LeavesPerAccount,
    LOG2_LEAF_SIZE,
} from "./config/accounts.js";
export * from "./config/errors.js";
export { splitSize } from "./config/size.js";
export type * from "./config/types.js";

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
