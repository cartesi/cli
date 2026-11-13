import type { TomlValue } from "smol-toml";
import { type Address, getAddress, isAddress } from "viem";
import {
    InvalidAddressValueError,
    InvalidBooleanValueError,
    InvalidEnvError,
    InvalidNumberValueError,
    InvalidStringArrayError,
    InvalidStringValueError,
    RequiredFieldError,
} from "../errors.js";
import { isTomlTable } from "./tables.js";

export { parseBytes, parseSize } from "../size.js";

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
