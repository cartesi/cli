import type { TomlTable, TomlValue } from "smol-toml";
import { UnknownConfigKeyError } from "../errors.js";

/**
 * Fails on any key of a table that its parser doesn't read, naming the keys the table accepts.
 * @param where where the table is, e.g. "in [machine]" or "at the top level"
 */
export const assertKnownKeys = (
    table: TomlTable,
    known: readonly string[],
    where: string,
): void => {
    const unknown = Object.keys(table).filter((key) => !known.includes(key));
    if (unknown.length > 0) {
        throw new UnknownConfigKeyError(unknown, known, where);
    }
};

/**
 * Checks if a value is a plain object (TOML table)
 */
export function isTomlTable(value: TomlValue): value is TomlTable {
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
