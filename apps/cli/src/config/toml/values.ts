import type { TomlValue } from "smol-toml";
import { type Address, getAddress, isAddress } from "viem";
import {
    InvalidAddressValueError,
    InvalidBooleanValueError,
    InvalidBytesValueError,
    InvalidEnvError,
    InvalidNumberValueError,
    InvalidStringArrayError,
    InvalidStringValueError,
    RequiredFieldError,
} from "../errors.js";
import { isTomlTable } from "./tables.js";

export const parseBoolean = (
    value: TomlValue,
    defaultValue: boolean,
): boolean => {
    if (value === undefined) {
        return defaultValue;
    }
    if (typeof value === "boolean") {
        return value;
    }
    throw new InvalidBooleanValueError(value);
};

export const parseOptionalBoolean = (value: TomlValue): boolean | undefined => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "boolean") {
        return value;
    }
    throw new InvalidBooleanValueError(value);
};

export const parseString = (value: TomlValue, defaultValue: string): string => {
    if (value === undefined) {
        return defaultValue;
    }
    if (typeof value === "string") {
        return value;
    }
    throw new InvalidStringValueError(value);
};

export const parseStringArray = (value: TomlValue): string[] => {
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
export const parseStringRecord = (value: TomlValue): Record<string, string> => {
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

export const parseRequiredString = (value: TomlValue, key: string): string => {
    if (value === undefined) {
        throw new RequiredFieldError(key);
    }
    if (typeof value === "string") {
        return value;
    }
    throw new InvalidStringValueError(value);
};

export const parseRequiredAddress = (
    value: TomlValue,
    key: string,
): Address => {
    if (value === undefined) {
        throw new RequiredFieldError(key);
    }
    if (typeof value === "string" && isAddress(value)) {
        return getAddress(value);
    }
    throw new InvalidAddressValueError(value, key);
};

export const parseOptionalString = (value: TomlValue): string | undefined => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "string") {
        return value;
    }
    throw new InvalidStringValueError(value);
};

export const parseOptionalStringBoolean = (
    value: TomlValue,
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

export const parseOptionalNumber = (value: TomlValue): bigint | undefined => {
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

const IEC_MULTIPLIERS: Readonly<Record<string, number>> = {
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
export const parseSize = (value: TomlValue): number | undefined => {
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

export const parseBytes = (value: TomlValue, defaultValue: number): number =>
    parseSize(value) ?? defaultValue;
