import { anvil } from "viem/chains";
import type { ComposeFile, Config, Service } from "../types/compose.js";
import { DEFAULT_HEALTHCHECK } from "./common.js";

type ServiceOptions = {
    databaseHost?: string;
    databasePassword: string;
    databasePort?: number;
    apiTag?: string;
    imageTag?: string;
    port?: number;
};

// Explorer API service
export const apiService = (options: ServiceOptions): Service => {
    const imageTag = options.apiTag ?? "latest";
    const databasePassword = options.databasePassword;
    const databaseHost = options.databaseHost ?? "database";
    const databasePort = options.databasePort ?? 5432;

    return {
        image: `cartesi/rollups-explorer-api:${imageTag}`,
        environment: {
            DB_PORT: databasePort.toString(),
            DB_HOST: databaseHost,
            DB_PASS: databasePassword,
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
        },
    };
};

// Explorer API Proxy configuration
export const explorerApiProxyConfig = (): Config => {
    return {
        name: "explorer-api-proxy",
        content: `http:
    routers:
        explorer-api:
            rule: "PathPrefix(\`/explorer-api\`)"
            middlewares:
                - "remove-explorer-api-prefix"
            service: explorer_api
    middlewares:
        remove-explorer-api-prefix:
            replacePathRegex:
                regex: "^/explorer-api/(.*)"
                replacement: "/$1"
    services:
        explorer_api:
            loadBalancer:
                servers:
                    - url: "http://explorer_api:4350"
`,
    };
};

// Squid Processor service
export const squidProcessorService = (options: ServiceOptions): Service => {
    const imageTag = options.apiTag ?? "latest";
    const databasePassword = options.databasePassword;
    const databaseHost = options.databaseHost ?? "database";
    const databasePort = options.databasePort ?? 5432;
    const chain = anvil;
    const environment: Record<string, string> = {
        DB_HOST: databaseHost,
        DB_NAME: "explorer",
        DB_PASS: databasePassword,
        DB_PORT: databasePort.toString(),
        CHAIN_IDS: chain.id.toString(),
    };
    environment[`RPC_URL_${chain.id}`] = `http://anvil:8545`;
    environment[`BLOCK_CONFIRMATIONS_${chain.id}`] = "0";
    environment[`GENESIS_BLOCK_${chain.id}`] = "1";

    return {
        image: `cartesi/rollups-explorer-api:${imageTag}`,
        environment,
        command: ["sqd", "process:prod"],
        depends_on: {
            database: { condition: "service_healthy" },
        },
    };
};

// Explorer service
export const explorerService = (options: ServiceOptions): Service => {
    const imageTag = options.imageTag ?? "latest";
    const port = options.port ?? 6571;

    const nodeRpcUrl = `http://127.0.0.1:${port}/anvil`;
    const explorerApiUrl = `http://127.0.0.1:${port}/explorer-api/graphql`;

    return {
        image: `cartesi/rollups-explorer:${imageTag}`,
        environment: {
            NODE_RPC_URL: nodeRpcUrl,
            EXPLORER_API_URL: explorerApiUrl,
        },
        expose: ["3000"],
        depends_on: {
            database: { condition: "service_healthy" },
        },
    };
};

// Explorer Proxy configuration
export const explorerProxyConfig = (): Config => {
    return {
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
};

export default (options: ServiceOptions): ComposeFile => ({
    configs: {
        explorer_api_proxy: explorerApiProxyConfig(),
        explorer_proxy: explorerProxyConfig(),
    },
    services: {
        explorer_api: apiService(options),
        explorer: explorerService(options),
        squid_processor: squidProcessorService(options),
        proxy: {
            configs: [
                {
                    source: "explorer_proxy",
                    target: "/etc/traefik/conf.d/explorer.yaml",
                },
                {
                    source: "explorer_api_proxy",
                    target: "/etc/traefik/conf.d/explorer-api.yaml",
                },
            ],
        },
    },
});
