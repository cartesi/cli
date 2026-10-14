import { MAX_NVRAMS, NVRAM_ALIGNMENT } from "./limits.js";

/**
 * Typed errors thrown while reading and validating the configuration of an
 * application, regardless of the format it was written in.
 */

// smol-toml creates tables with a null prototype, which can't be coerced to a
// string by template literals, so format objects (tables, arrays) as JSON.
export const formatValue = (value: unknown): string =>
    typeof value === "object" && value !== null && !(value instanceof Date)
        ? JSON.stringify(value, (_, v) =>
              typeof v === "bigint" ? v.toString() : v,
          )
        : String(value);

export class InvalidBuilderError extends Error {
    constructor(builder: unknown) {
        super(`Invalid builder: ${formatValue(builder)}`);
        this.name = "InvalidBuilder";
    }
}

export class InvalidDriveFormatError extends Error {
    constructor(format: unknown) {
        super(`Invalid drive format: ${formatValue(format)}`);
        this.name = "InvalidDriveFormatError";
    }
}

export class InvalidEmptyDriveFormatError extends Error {
    constructor(format: unknown) {
        super(`Invalid empty drive format: ${formatValue(format)}`);
        this.name = "InvalidEmptyDriveFormatError";
    }
}

export class InvalidStringValueError extends Error {
    constructor(value: unknown) {
        super(`Invalid string value: ${formatValue(value)}`);
        this.name = "InvalidStringValueError";
    }
}

export class InvalidBooleanValueError extends Error {
    constructor(value: unknown) {
        super(`Invalid boolean value: ${formatValue(value)}`);
        this.name = "InvalidBooleanValueError";
    }
}

export class InvalidNumberValueError extends Error {
    constructor(value: unknown, key?: string) {
        super(
            `Invalid number value: ${formatValue(value)}${key ? ` for key: ${key}` : ""}`,
        );
        this.name = "InvalidNumberValueError";
    }
}

export class InvalidAddressValueError extends Error {
    constructor(value: unknown, key?: string) {
        super(
            `Invalid address value: ${formatValue(value)}${key ? ` for key: ${key}` : ""}`,
        );
        this.name = "InvalidAddressValueError";
    }
}

export class InvalidBytesValueError extends Error {
    constructor(value: unknown) {
        super(`Invalid bytes value: ${formatValue(value)}`);
        this.name = "InvalidBytesValueError";
    }
}

export class RequiredFieldError extends Error {
    constructor(key: unknown) {
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
    constructor(value: unknown) {
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

/**
 * Thrown when a section of the configuration is expected to be an object, but
 * is something else.
 */
export class InvalidSectionError extends Error {
    constructor(section: string, value: unknown) {
        super(`Invalid '${section}' configuration: ${formatValue(value)}`);
        this.name = "InvalidSectionError";
    }
}

/**
 * Thrown when a field only accepts a fixed set of values, and is given
 * something else.
 */
export class InvalidEnumValueError extends Error {
    constructor(key: string, value: unknown, allowed: readonly string[]) {
        super(
            `Invalid value for '${key}': ${formatValue(value)}, must be one of ${allowed.join(", ")}`,
        );
        this.name = "InvalidEnumValueError";
    }
}

/**
 * Thrown when a configuration file explicitly asked for does not exist.
 */
export class ConfigFileNotFoundError extends Error {
    constructor(filename: string) {
        super(`Config file ${filename} does not exist`);
        this.name = "ConfigFileNotFoundError";
    }
}

/**
 * Thrown when a configuration file has an extension the CLI cannot read.
 */
export class UnsupportedConfigFormatError extends Error {
    constructor(filename: string) {
        super(`Unsupported configuration file format: ${filename}`);
        this.name = "UnsupportedConfigFormatError";
    }
}

/**
 * Thrown when a TypeScript or JavaScript configuration file does not export a
 * configuration as its default export.
 */
export class InvalidConfigExportError extends Error {
    constructor(filename: string) {
        super(
            `Configuration file ${filename} must have a default export with the application configuration, ` +
                "as in 'export default defineConfig({ ... })'",
        );
        this.name = "InvalidConfigExportError";
    }
}

/**
 * Thrown when the runtime cannot import a TypeScript configuration file.
 */
export class TypeScriptNotSupportedError extends Error {
    constructor(filename: string) {
        super(
            `Cannot import ${filename}: this runtime does not strip TypeScript types. ` +
                "Run on node 24 or later without '--no-experimental-strip-types', or write the configuration as cartesi.config.js, .json or .yaml",
        );
        this.name = "TypeScriptNotSupportedError";
    }
}
