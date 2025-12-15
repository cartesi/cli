import { Service } from "../types/compose.js";
import { DB_ENV, DEFAULT_HEALTHCHECK } from "./common.js";

// Database service
export const DATABASE_SVC: Service = {
    image: "cartesi/rollups-database:latest",
    healthcheck: {
        ...DEFAULT_HEALTHCHECK,
        test: ["CMD-SHELL", "pg_isready -U postgres || exit 1"],
    },
    environment: {
        POSTGRES_PASSWORD: DB_ENV.DB_PASS,
    },
};
