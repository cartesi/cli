import { anvil } from "viem/chains";
import {
    daveAppFactoryAddress,
    inputBoxAddress,
    selfHostedApplicationFactoryAddress,
} from "../contracts.js";
import type { ComposeFile, Config, Service } from "../types/compose.js";
import { DEFAULT_HEALTHCHECK } from "./common.js";

type ServiceOptions = {
    cpus?: number;
    databaseHost?: string;
    databasePort?: number;
    databasePassword: string;
    defaultBlock?: "latest" | "safe" | "pending" | "finalized";
    forkChainId?: number;
    logLevel?: "info" | "debug" | "warn" | "error" | "fatal";
    memory?: number;
    mnemonic?: string;
    imageTag?: string;
    prt?: boolean;
};

// Rollups Node service
const service = (options: ServiceOptions): Service => {
    const databasePassword = options.databasePassword;
    const databaseHost = options.databaseHost ?? "database";
    const databasePort = options.databasePort ?? 5432;
    const defaultBlock = options.defaultBlock ?? "latest";
    const imageTag = options.imageTag ?? "latest";
    const logLevel = options.logLevel ?? "info";
    const mnemonic =
        options.mnemonic ??
        "test test test test test test test test test test test junk";
    const prt = options.prt ?? false;
    const chainId = (options.forkChainId ??
        31337) as keyof typeof daveAppFactoryAddress;

    let chainDaveAppFactoryAddress: string | undefined;
    if (prt) {
        chainDaveAppFactoryAddress = daveAppFactoryAddress[chainId];
        if (!chainDaveAppFactoryAddress) {
            throw new Error(`Unsupported fork chain ${chainId}`);
        }
    }

    return {
        image: `cartesi/rollups-runtime:${imageTag}`,
        init: true,
        depends_on: {
            database: { condition: "service_healthy" },
            anvil: { condition: "service_healthy" },
        },
        deploy: {
            resources: {
                limits: {
                    cpus:
                        options.cpus !== undefined
                            ? options.cpus.toString()
                            : undefined,
                    memory:
                        options.memory !== undefined
                            ? `${options.memory.toString()}M`
                            : undefined,
                },
            },
        },
        expose: ["10000", "10011", "10012"],
        healthcheck: {
            ...DEFAULT_HEALTHCHECK,
            test: ["CMD", "curl", "-fsS", "http://127.0.0.1:10000/livez"],
        },
        command: ["cartesi-rollups-node"],
        environment: {
            CARTESI_AUTH_MNEMONIC: mnemonic,
            CARTESI_BLOCKCHAIN_DEFAULT_BLOCK: defaultBlock,
            CARTESI_BLOCKCHAIN_HTTP_ENDPOINT: "http://anvil:8545",
            CARTESI_BLOCKCHAIN_ID: anvil.id.toString(),
            ...(chainDaveAppFactoryAddress && {
                CARTESI_CONTRACTS_DAVE_APP_FACTORY_ADDRESS:
                    chainDaveAppFactoryAddress,
            }),
            CARTESI_CONTRACTS_INPUT_BOX_ADDRESS: inputBoxAddress,
            CARTESI_CONTRACTS_SELF_HOSTED_APPLICATION_FACTORY_ADDRESS:
                selfHostedApplicationFactoryAddress,
            CARTESI_DATABASE_CONNECTION: `postgres://postgres:${databasePassword}@${databaseHost}:${databasePort}/rollupsdb?sslmode=disable`,
            CARTESI_LOG_LEVEL: logLevel,
            CARTESI_SNAPSHOTS_DIR: "/var/lib/cartesi-rollups-node/snapshots",
        },
        volumes: ["./.cartesi:/var/lib/cartesi-rollups-node/snapshots:ro"],
    };
};

// Rollups Node proxy configuration
const proxy = (): Config => {
    return {
        name: "rollups-node-proxy",
        content: `
http:
    routers:
        inspect_server:
            rule: "PathPrefix(\`/inspect\`)"
            middlewares:
                - "cors"
            service: inspect_server
        rpc_server:
            rule: "PathPrefix(\`/rpc\`)"
            middlewares:
                - "cors"
            service: rpc_server
    middlewares:
        cors:
            headers:
                accessControlAllowMethods:
                    - GET
                    - OPTIONS
                    - POST
                accessControlAllowHeaders:
                    - "Origin"
                    - "Content-Type"
                    - "Accept"
                accessControlAllowOriginList:
                    - "*"
                accessControlMaxAge: 86400
                addVaryHeader: true
    services:
        inspect_server:
            loadBalancer:
                servers:
                    - url: "http://rollups_node:10012"
        rpc_server:
            loadBalancer:
                servers:
                    - url: "http://rollups_node:10011"
`,
    };
};

export default (options: ServiceOptions): ComposeFile => ({
    services: {
        proxy: {
            configs: [
                {
                    source: "rollups_node_proxy",
                    target: "/etc/traefik/conf.d/rollups-node.yaml",
                },
            ],
        },
        rollups_node: service(options),
    },
    configs: {
        rollups_node_proxy: proxy(),
    },
});
