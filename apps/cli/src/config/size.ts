import { InvalidBytesValueError } from "./errors.js";

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
export const formatSize = (bytes: number): string => {
    const { value, unit } = splitSize(bytes);
    return `${value}${unit}`;
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
export const parseSize = (value: unknown): number | undefined => {
    if (value === undefined) {
        return undefined;
    }
    let size: number | undefined;
    if (typeof value === "number") {
        size = value;
    } else if (typeof value === "bigint") {
        size = Number(value);
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

export const parseBytes = (value: unknown, defaultValue: number): number =>
    parseSize(value) ?? defaultValue;
