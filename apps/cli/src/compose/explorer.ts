import { Config, Service } from "../types/compose.js";
import { DB_ENV, DEFAULT_HEALTHCHECK } from "./common.js";

// Explorer API service
export const EXPLORER_API_SVC: Service = {
    image: "cartesi/rollups-explorer-api:latest",
    environment: {
        ...DB_ENV,
        DB_NAME: "explorer",
        GQL_PORT: 4350,
    },
    expose: ["4350"],
    command: ["sqd", "serve:prod"],
    healthcheck: {
        ...DEFAULT_HEALTHCHECK,
        test: [
            "CMD",
            "wget",
            "--spider",
            "-q",
            "http://127.0.0.1:4350/graphql?query=%7B__typename%7D",
        ],
    },
    depends_on: {
        database: { condition: "service_healthy" },
        "squid-processor": { condition: "service_started" },
    },
};

// Explorer API Proxy configuration
export const EXPLORER_API_PROXY_CFG: Config = {
    name: "explorer-api-proxy",
    content: `http:
    routers:
        explorer-api:
            rule: "PathPrefix(\`/explorer-api\`)"
            middlewares:
                - "remove-explorer-api-prefix"
            service: explorer-api
    middlewares:
        remove-explorer-api-prefix:
            replacePathRegex:
                regex: "^/explorer-api/(.*)"
                replacement: "/$1"
    services:
        explorer-api:
            loadBalancer:
                servers:
                    - url: "http://explorer-api:4350"
`,
};

// Squid Processor service
export const SQUID_PROCESSOR_SVC: Service = {
    image: "cartesi/rollups-explorer-api:latest",
    environment: {
        ...DB_ENV,
        DB_NAME: "explorer",
        CHAIN_IDS: "${CARTESI_BLOCKCHAIN_ID:-13370}",
        RPC_URL_13370: "${RPC_URL:-http://anvil:8545}",
        BLOCK_CONFIRMATIONS_13370: 0,
        GENESIS_BLOCK_13370: 1,
    },
    command: ["sqd", "process:prod"],
    depends_on: {
        database: { condition: "service_healthy" },
    },
};

// Explorer service
export const EXPLORER_SVC: Service = {
    image: "cartesi/rollups-explorer:latest",
    environment: {
        NODE_RPC_URL: "http://127.0.0.1:6571/anvil",
        EXPLORER_API_URL: "http://127.0.0.1:6571/explorer-api/graphql",
    },
    expose: ["3000"],
    depends_on: {
        database: { condition: "service_healthy" },
    },
};

// Explorer Proxy configuration
export const EXPLORER_PROXY_CFG: Config = {
    name: "explorer-proxy",
    content: `http:
    routers:
        explorer:
            rule: "PathPrefix(\`/explorer\`)"
            service: explorer
    services:
        explorer:
            loadBalancer:
                servers:
                    - url: "http://explorer:3000"`,
};
