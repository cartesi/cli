import type { Healthcheck } from "../types/compose.js";

export const DEFAULT_HEALTHCHECK: Healthcheck = {
    start_period: "10s",
    start_interval: "200ms",
    interval: "10s",
    timeout: "1s",
    retries: 5,
};

/**
 * Escapes a value for a compose file, which would otherwise read `$name` and
 * `${name}` in it as variables and replace them, `$` and all.
 * The container still gets the original value.
 */
export const escapeComposeValue = (value: string): string =>
    value.replaceAll("$", () => "$$");
