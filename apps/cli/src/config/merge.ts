import type { UserConfig } from "./user.js";

/**
 * Checks if a value is a plain object, and not an array, a class instance or
 * any other exotic object.
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

const merge = (
    base: Record<string, unknown>,
    other: Record<string, unknown>,
): Record<string, unknown> => {
    const result: Record<string, unknown> = { ...base };

    for (const [key, otherValue] of Object.entries(other)) {
        if (otherValue === undefined) {
            // an undefined value does not override anything, so a partial
            // configuration can be built with optional fields left out
            continue;
        }

        const baseValue = result[key];
        if (isPlainObject(baseValue) && isPlainObject(otherValue)) {
            result[key] = merge(baseValue, otherValue);
        } else {
            // arrays and scalars are replaced, not concatenated
            result[key] = otherValue;
        }
    }

    return result;
};

/**
 * Deep merge two configurations, with the values of `other` taking precedence
 * over the ones of `base`. Objects are merged recursively, while arrays and
 * scalars are replaced. Useful to share a base configuration between
 * applications, or to layer environment specific overrides:
 *
 * ```ts
 * export default defineConfig(
 *     mergeConfig(base, { machine: { ramLength: "256Mi" } }),
 * );
 * ```
 *
 * @param base base configuration
 * @param other configuration merged on top of `base`
 * @returns a new merged configuration
 */
export const mergeConfig = <T extends UserConfig>(
    base: T,
    other: UserConfig,
): T =>
    merge(
        base as Record<string, unknown>,
        other as Record<string, unknown>,
    ) as T;
