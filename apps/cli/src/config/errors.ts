/**
 * Typed errors thrown while reading and validating the configuration of an
 * application, regardless of the format it was written in.
 */

export class InvalidBuilderError extends Error {
    constructor(builder: unknown) {
        super(`Invalid builder: ${String(builder)}`);
        this.name = "InvalidBuilder";
    }
}

export class InvalidDriveFormatError extends Error {
    constructor(format: unknown) {
        super(`Invalid drive format: ${String(format)}`);
        this.name = "InvalidDriveFormatError";
    }
}

export class InvalidEmptyDriveFormatError extends Error {
    constructor(format: unknown) {
        super(`Invalid empty drive format: ${String(format)}`);
        this.name = "InvalidEmptyDriveFormatError";
    }
}

export class InvalidStringValueError extends Error {
    constructor(value: unknown) {
        super(`Invalid string value: ${String(value)}`);
        this.name = "InvalidStringValueError";
    }
}

export class InvalidBooleanValueError extends Error {
    constructor(value: unknown) {
        super(`Invalid boolean value: ${String(value)}`);
        this.name = "InvalidBooleanValueError";
    }
}

export class InvalidNumberValueError extends Error {
    constructor(value: unknown, key?: string) {
        super(
            `Invalid number value: ${String(value)}${key ? ` for key: ${key}` : ""}`,
        );
        this.name = "InvalidNumberValueError";
    }
}

export class InvalidAddressValueError extends Error {
    constructor(value: unknown, key?: string) {
        super(
            `Invalid address value: ${String(value)}${key ? ` for key: ${key}` : ""}`,
        );
        this.name = "InvalidAddressValueError";
    }
}

export class InvalidBytesValueError extends Error {
    constructor(value: unknown) {
        super(`Invalid bytes value: ${String(value)}`);
        this.name = "InvalidBytesValueError";
    }
}

export class RequiredFieldError extends Error {
    constructor(key: unknown) {
        super(`Missing required field: ${String(key)}`);
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
        super(`Invalid env configuration: ${String(value)}`);
        this.name = "InvalidEnvError";
    }
}

/**
 * Thrown when a section of the configuration is expected to be an object, but
 * is something else.
 */
export class InvalidSectionError extends Error {
    constructor(section: string, value: unknown) {
        super(`Invalid '${section}' configuration: ${String(value)}`);
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
            `Invalid value for '${key}': ${String(value)}, must be one of ${allowed.join(", ")}`,
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
