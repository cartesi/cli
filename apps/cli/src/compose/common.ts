import type { Healthcheck } from "../types/compose.js";

export const DEFAULT_HEALTHCHECK: Healthcheck = {
    start_period: "10s",
    start_interval: "200ms",
    interval: "10s",
    timeout: "1s",
    retries: 5,
};
