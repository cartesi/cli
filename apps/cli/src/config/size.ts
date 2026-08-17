import { InvalidBytesValueError } from "./errors.js";

/**
 * Multiples accepted by {@link parseSize}. All of them are binary, which is
 * what the tools building the drives expect, so `kb` and `KiB` are the same
 * 1024 bytes.
 */
const SIZE_UNITS: Record<string, number> = {
    b: 1,
    k: 1024,
    m: 1024 ** 2,
    g: 1024 ** 3,
    t: 1024 ** 4,
    p: 1024 ** 5,
};

const SIZE_PATTERN = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*([kmgtp]i?b?|b)?$/i;

/**
 * Parse a size into a number of bytes, accepting both a number of bytes and a
 * human readable string such as `"64Mb"`, `"64MB"`, `"64Mi"` or `"64MiB"`.
 *
 * Unrecognized strings are rejected rather than coerced, which is why this
 * does not use `bytes.parse`: that one falls back to `parseInt`, and silently
 * reads `"64Mi"` as 64 bytes.
 *
 * @param value size as written in the configuration
 * @returns size in bytes
 */
export const parseSize = (value: unknown): number => {
    if (typeof value === "bigint") {
        return Number(value);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const match = SIZE_PATTERN.exec(value.trim());
        if (match) {
            const [, amount, unit = "b"] = match;
            const multiple = SIZE_UNITS[unit[0].toLowerCase()];
            return Math.floor(Number(amount) * multiple);
        }
    }
    throw new InvalidBytesValueError(value);
};
