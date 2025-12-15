import type { ComposeFile, Service } from "../types/compose.js";
import { DEFAULT_HEALTHCHECK } from "./common.js";

type ServiceOptions = {
    imageTag?: string;
    password: string;
};

// Database service
export const service = (options: ServiceOptions): Service => {
    const imageTag = options?.imageTag ?? "latest";
    return {
        image: `cartesi/rollups-database:${imageTag}`,
        healthcheck: {
            ...DEFAULT_HEALTHCHECK,
            test: ["CMD-SHELL", "pg_isready -U postgres || exit 1"],
        },
        environment: {
            POSTGRES_PASSWORD: options?.password,
        },
    };
};

export default (options: ServiceOptions): ComposeFile => ({
    services: {
        database: service(options),
    },
});
