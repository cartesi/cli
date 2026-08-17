import { parse as parseToml, type TomlPrimitive } from "smol-toml";
import { type Address, getAddress, isAddress, isHex } from "viem";
import {
    InvalidAddressValueError,
    InvalidBooleanValueError,
    InvalidBuilderError,
    InvalidDriveFormatError,
    InvalidEmptyDriveFormatError,
    InvalidEnvError,
    InvalidNumberValueError,
    InvalidStringArrayError,
    InvalidStringValueError,
    RequiredFieldError,
} from "./errors.js";
import { parseSize } from "./size.js";
import {
    type Builder,
    type Config,
    DEFAULT_FORMAT,
    DEFAULT_RAM,
    DEFAULT_SDK_IMAGE,
    DEFAULT_SDK_VERSION,
    defaultMachineConfig,
    defaultRootDriveConfig,
    defaultRunConfig,
    type DriveConfig,
    type DriveFormat,
    getDriveFormat,
    type MachineConfig,
    type WithdrawalConfig,
} from "./types.js";

/**
 * Parser of the legacy `cartesi.toml` configuration file.
 *
 * This format is deprecated in favour of `cartesi.config.ts` (and its plain
 * data equivalents), which is why it is kept frozen here: it uses snake_case
 * keys and has no `[run]` section. It is still fully supported so existing
 * applications keep building.
 */

type TomlTable = { [key: string]: TomlPrimitive };

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

const parseBytes = (value: TomlPrimitive, defaultValue: number): number =>
    value === undefined ? defaultValue : parseSize(value);

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

/**
 * Parse the contents of one or more legacy `cartesi.toml` files, merged in
 * order, into a resolved application configuration.
 * @param str contents of the TOML files
 * @returns resolved application configuration
 */
export const parse = (str: string[]): Config => {
    let toml: TomlTable = {};
    for (const s of str) {
        toml = mergeTomlTables(toml, parseToml(s));
    }

    const config: Config = {
        withdrawalConfig: parseOptionalWithdrawalConfig(toml.withdrawal),
        drives: parseDrives(toml.drives),
        machine: parseMachine(toml.machine),
        run: defaultRunConfig(),
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
