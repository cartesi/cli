import type { TomlValue } from "smol-toml";
import { MAX_NVRAMS, NVRAM_ALIGNMENT } from "./constants.js";

// smol-toml creates tables with a null prototype, which can't be coerced to a
// string by template literals, so format objects (tables, arrays) as JSON.
export const formatValue = (value: TomlValue): string =>
    typeof value === "object" && value !== null && !(value instanceof Date)
        ? JSON.stringify(value, (_, v) =>
              typeof v === "bigint" ? v.toString() : v,
          )
        : String(value);

export class InvalidBuilderError extends Error {
    constructor(builder: TomlValue) {
        super(`Invalid builder: ${formatValue(builder)}`);
        this.name = "InvalidBuilder";
    }
}

export class InvalidDriveFormatError extends Error {
    constructor(format: TomlValue) {
        super(`Invalid drive format: ${formatValue(format)}`);
        this.name = "InvalidDriveFormatError";
    }
}

export class InvalidEmptyDriveFormatError extends Error {
    constructor(format: TomlValue) {
        super(`Invalid empty drive format: ${formatValue(format)}`);
        this.name = "InvalidEmptyDriveFormatError";
    }
}

export class InvalidStringValueError extends Error {
    constructor(value: TomlValue) {
        super(`Invalid string value: ${formatValue(value)}`);
        this.name = "InvalidStringValueError";
    }
}

export class InvalidBooleanValueError extends Error {
    constructor(value: TomlValue) {
        super(`Invalid boolean value: ${formatValue(value)}`);
        this.name = "InvalidBooleanValueError";
    }
}

export class InvalidNumberValueError extends Error {
    constructor(value: TomlValue, key?: string) {
        super(
            `Invalid number value: ${formatValue(value)}${key ? ` for key: ${key}` : ""}`,
        );
        this.name = "InvalidNumberValueError";
    }
}

export class InvalidAddressValueError extends Error {
    constructor(value: TomlValue, key?: string) {
        super(
            `Invalid address value: ${formatValue(value)}${key ? ` for key: ${key}` : ""}`,
        );
        this.name = "InvalidAddressValueError";
    }
}

export class InvalidBytesValueError extends Error {
    constructor(value: TomlValue) {
        super(`Invalid bytes value: ${formatValue(value)}`);
        this.name = "InvalidBytesValueError";
    }
}

export class RequiredFieldError extends Error {
    constructor(key: TomlValue) {
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
    constructor(value: TomlValue) {
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

export class InvalidPrtConfigError extends Error {
    /**
     * @param where the table at fault, `[prt]` by default, or an entry such as `prt.sentries[2]`
     */
    constructor(reason: string, where = "[prt]") {
        super(`Invalid ${where}: ${reason}`);
        this.name = "InvalidPrtConfigError";
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
    constructor(location: string, value: TomlValue) {
        super(
            `Invalid ${location}: expected a table, got ${formatValue(value)}`,
        );
        this.name = "InvalidTableError";
    }
}
