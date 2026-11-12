import { anvil } from "viem/chains";
import type { CartesiEnvironmentVariables } from "../base.js";
import {
    applicationFactoryAddress,
    daveAppFactoryAddress,
    inputBoxAddress,
    selfHostedApplicationFactoryAddress,
} from "../contracts.js";
import type { ComposeFile, Config, Service } from "../types/compose.js";
import { DEFAULT_HEALTHCHECK, escapeComposeValue } from "./common.js";
import { type FileSecret, fileSecret, secretInitService } from "./secrets.js";

/**
 * Mnemonic of the devnet test accounts, used by the node to sign transactions
 */
export const DEVNET_MNEMONIC =
    "test test test test test test test test test test test junk";

export type ServiceOptions = {
    cpus?: number;
    databaseHost?: string;
    databasePort?: number;
    databasePassword: string;
    defaultBlock?: "latest" | "safe" | "finalized";
    forkChainId?: number;
    logLevel?: "info" | "debug" | "warn" | "error" | "fatal";
    memory?: number;
    mnemonic?: string;
    imageTag?: string;
    prt?: boolean;
    /**
     * whether the node submits claims, the default; with a sling claimer it
     * runs in reader mode, following the tournaments and recording settled
     * epochs with no PRT signer
     */
    claimSubmission?: boolean;
    cartesiEnvironmentVariables?: CartesiEnvironmentVariables;
};

/**
 * A list of allowed environment variables
 * that can be passed to the rollups node service.
 * A number of environment variables are rule out to avoid confusion e.g. CORS, FEATURE Enablement, etc.
 */
export const nodeAllowedEnvironmentVariables = [
    "CARTESI_AUTH_KIND",
    "CARTESI_AUTH_MNEMONIC",
    "CARTESI_AUTH_MNEMONIC_ACCOUNT_INDEX",
    "CARTESI_AUTH_MNEMONIC_FILE",
    "CARTESI_AUTH_PRIVATE_KEY",
    "CARTESI_AUTH_PRIVATE_KEY_FILE",
    "CARTESI_BLOCKCHAIN_DEFAULT_BLOCK",
    "CARTESI_BLOCKCHAIN_HTTP_AUTHORIZATION",
    "CARTESI_BLOCKCHAIN_HTTP_ENDPOINT",
    "CARTESI_BLOCKCHAIN_ID",
    "CARTESI_CONTRACTS_APPLICATION_FACTORY_ADDRESS",
    "CARTESI_CONTRACTS_AUTHORITY_FACTORY_ADDRESS",
    "CARTESI_CONTRACTS_DAVE_APP_FACTORY_ADDRESS",
    "CARTESI_CONTRACTS_INPUT_BOX_ADDRESS",
    "CARTESI_CONTRACTS_QUORUM_FACTORY_ADDRESS",
    "CARTESI_CONTRACTS_SELF_HOSTED_APPLICATION_FACTORY_ADDRESS",
    "CARTESI_DATABASE_CONNECTION",
    "CARTESI_LOG_LEVEL",
    "CARTESI_LOG_LEVEL_ADVANCER",
    "CARTESI_LOG_LEVEL_CLAIMER",
    "CARTESI_LOG_LEVEL_EVM_READER",
    "CARTESI_LOG_LEVEL_JSONRPC_API",
    "CARTESI_LOG_LEVEL_PRT",
    "CARTESI_LOG_LEVEL_VALIDATOR",
    "CARTESI_JSONRPC_MACHINE_LOG_LEVEL",
    // Only the mnemonic and private-key kinds are reachable here: the aws
    // kind needs AWS_REGION and the SDK credential chain, which are not
    // CARTESI_-prefixed and so never reach getCartesiEnvironmentVariables.
    "CARTESI_PRT_AUTH_KIND",
    "CARTESI_PRT_AUTH_MNEMONIC",
    "CARTESI_PRT_AUTH_MNEMONIC_ACCOUNT_INDEX",
    "CARTESI_PRT_AUTH_MNEMONIC_FILE",
    "CARTESI_PRT_AUTH_PRIVATE_KEY",
    "CARTESI_PRT_AUTH_PRIVATE_KEY_FILE",
    "CARTESI_SNAPSHOTS_DIR",
] as const;

type NodeAllowedEnvironmentVars = Partial<
    Record<(typeof nodeAllowedEnvironmentVariables)[number], string>
>;

/**
 *  Returns a subset of the provided environment variables that are allowed
 * to be passed to the rollups node service.
 *  If no environment variables are provided, an empty object is returned.
 *  @param cartesiVars - An object containing environment variables to filter.
 *  @returns An object containing only the allowed environment variables.
 * @param cartesiVars
 * @returns
 */
export const getNodeAllowedVariables = (
    cartesiVars?: CartesiEnvironmentVariables,
): NodeAllowedEnvironmentVars => {
    const allowedVars = nodeAllowedEnvironmentVariables.reduce(
        (acc, variableName) => {
            const value = cartesiVars?.[variableName];

            if (value !== undefined && value !== null) {
                acc[variableName] = value;
            }

            return acc;
        },
        {} as NodeAllowedEnvironmentVars,
    );

    return allowedVars;
};

/**
 * The allowed variables of the node's PRT signer, which a reader-mode node
 * has no use for.
 */
export const nodePrtAuthVariables = nodeAllowedEnvironmentVariables.filter(
    (name) => name.startsWith("CARTESI_PRT_AUTH_"),
);

/**
 * The allowed variables that name a file the node reads its keys from.
 * Forwarding only the path would leave the node without the file, so each
 * one is copied into the container instead.
 */
export const nodeSecretFileVariables = nodeAllowedEnvironmentVariables.filter(
    (name) => name.endsWith("_FILE"),
);

const isPrtAuthVariable = (name: string) =>
    (nodePrtAuthVariables as readonly string[]).includes(name);

/** Service that copies the key files for the node, and its volume. */
const SECRET_INIT_SERVICE = "node-secret-init";
const SECRETS_VOLUME = "node_secrets";

/**
 * Returns the key files named in the host variables, each with the variable
 * that points the node at its copy.
 */
const nodeFileSecrets = (
    cartesiVars: CartesiEnvironmentVariables | undefined,
    claimSubmission: boolean,
): (FileSecret & { variable: string })[] => {
    const allowedVars = getNodeAllowedVariables(cartesiVars);
    return nodeSecretFileVariables.flatMap((variable) => {
        if (!claimSubmission && isPrtAuthVariable(variable)) {
            return [];
        }
        const hostPath = allowedVars[variable];
        return hostPath === undefined
            ? []
            : [{ variable, ...fileSecret(variable.toLowerCase(), hostPath) }];
    });
};

// Rollups Node service
const service = (
    options: ServiceOptions,
    fileSecrets: (FileSecret & { variable: string })[],
): Service => {
    const databasePassword = options.databasePassword;
    const databaseHost = options.databaseHost ?? "database";
    const databasePort = options.databasePort ?? 5432;
    const defaultBlock = options.defaultBlock ?? "latest";
    const imageTag = options.imageTag ?? "latest";
    const logLevel = options.logLevel ?? "info";
    const mnemonic = options.mnemonic ?? DEVNET_MNEMONIC;
    const prt = options.prt ?? false;
    const claimSubmission = options.claimSubmission ?? true;
    const chainId = (options.forkChainId ??
        31337) as keyof typeof daveAppFactoryAddress;

    let chainDaveAppFactoryAddress: string | undefined;

    if (prt) {
        chainDaveAppFactoryAddress = daveAppFactoryAddress[chainId];
    }

    const defaultVars = {
        CARTESI_AUTH_MNEMONIC: mnemonic,
        // First account generated by the devnet test mnemonic 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
        CARTESI_AUTH_MNEMONIC_ACCOUNT_INDEX: "0",
        CARTESI_BLOCKCHAIN_DEFAULT_BLOCK: defaultBlock,
        CARTESI_BLOCKCHAIN_HTTP_ENDPOINT: "http://anvil:8545",
        CARTESI_BLOCKCHAIN_ID: anvil.id.toString(),
        // a deploy on an existing consensus, as the shell's redeploy does,
        // creates only the application, through this factory
        CARTESI_CONTRACTS_APPLICATION_FACTORY_ADDRESS:
            applicationFactoryAddress,
        ...(chainDaveAppFactoryAddress && {
            CARTESI_CONTRACTS_DAVE_APP_FACTORY_ADDRESS:
                chainDaveAppFactoryAddress,
        }),
        CARTESI_CONTRACTS_INPUT_BOX_ADDRESS: inputBoxAddress,
        CARTESI_CONTRACTS_SELF_HOSTED_APPLICATION_FACTORY_ADDRESS:
            selfHostedApplicationFactoryAddress,
        CARTESI_DATABASE_CONNECTION: `postgres://postgres:${databasePassword}@${databaseHost}:${databasePort}/rollupsdb?sslmode=disable`,
        CARTESI_LOG_LEVEL: logLevel,
        // The node always starts its PRT service, and with claim submission
        // enabled by default that service needs its own signer. PRT has no
        // default mnemonic, so the devnet one is supplied explicitly. With a
        // sling claimer the node reads instead, and needs no PRT signer.
        ...(claimSubmission
            ? { CARTESI_PRT_AUTH_MNEMONIC: mnemonic }
            : { CARTESI_FEATURE_CLAIM_SUBMISSION_ENABLED: "false" }),
        CARTESI_SNAPSHOTS_DIR: "/var/lib/cartesi-rollups-node/snapshots",
    };

    // the host values are the user's own and may hold a `$`, e.g. in a
    // password, which compose must not interpolate
    const hostVars = Object.fromEntries(
        Object.entries(
            getNodeAllowedVariables(options.cartesiEnvironmentVariables),
        )
            // a reader-mode node has no PRT signer, so the host's is dropped
            .filter(([name]) => claimSubmission || !isPrtAuthVariable(name))
            .map(([name, value]) => [name, escapeComposeValue(value)]),
    );

    // the key files reach the node as secrets, at a path inside the container
    for (const { variable, target } of fileSecrets) {
        hostVars[variable] = target;
    }

    // Merge default and host environment variables, with host variables taking precedence
    // further to the right of the parameter list the higher the precedence
    // TODO: Here or somewhere else; Add other variables with precedence rules, e.g. command line > <config>.toml > host environment > default
    const environmentVariables = Object.assign({}, defaultVars, hostVars);

    return {
        image: `cartesi/rollups-runtime:${imageTag}`,
        init: true,
        depends_on: {
            database: { condition: "service_healthy" },
            anvil: { condition: "service_healthy" },
            ...(fileSecrets.length > 0 && {
                [SECRET_INIT_SERVICE]: {
                    condition: "service_completed_successfully",
                },
            }),
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
            ...environmentVariables,
        },
        volumes: [
            "./.cartesi:/var/lib/cartesi-rollups-node/snapshots:ro",
            ...(fileSecrets.length > 0
                ? [`${SECRETS_VOLUME}:/run/secrets:ro`]
                : []),
        ],
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

export default (options: ServiceOptions): ComposeFile => {
    const fileSecrets = nodeFileSecrets(
        options.cartesiEnvironmentVariables,
        options.claimSubmission ?? true,
    );

    return {
        services: {
            proxy: {
                configs: [
                    {
                        source: "rollups_node_proxy",
                        target: "/etc/traefik/conf.d/rollups-node.yaml",
                    },
                ],
            },
            rollups_node: service(options, fileSecrets),
            ...(fileSecrets.length > 0 && {
                [SECRET_INIT_SERVICE]: secretInitService({
                    imageTag: options.imageTag ?? "latest",
                    secrets: fileSecrets,
                    volume: SECRETS_VOLUME,
                }),
            }),
        },
        configs: {
            rollups_node_proxy: proxy(),
        },
        ...(fileSecrets.length > 0 && {
            volumes: { [SECRETS_VOLUME]: {} },
        }),
    };
};
