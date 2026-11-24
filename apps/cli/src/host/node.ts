import path from "node:path";
import type { CartesiEnvironmentVariables } from "../base.js";
import {
    applicationFactoryAddress,
    daveAppFactoryAddress,
    inputBoxAddress,
    selfHostedApplicationFactoryAddress,
} from "../contracts.js";
import { DEVNET_CHAIN_ID } from "./anvil.js";
import type { ProcessSpec } from "./process.js";

/**
 * Mnemonic of the devnet test accounts, used by the node to sign transactions
 */
export const DEVNET_MNEMONIC =
    "test test test test test test test test test test test junk";

/** Name of the node service, as `cartesi logs` and `cartesi status` know it. */
export const NODE_SERVICE = "rollups_node";

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
 * The allowed variables that name a file the node reads its keys from. The
 * node runs on the host, so it reads the file the host names, a relative path
 * resolved against the project directory.
 */
export const nodeSecretFileVariables = nodeAllowedEnvironmentVariables.filter(
    (name) => name.endsWith("_FILE"),
);

const isPrtAuthVariable = (name: string) =>
    (nodePrtAuthVariables as readonly string[]).includes(name);

const isSecretFileVariable = (name: string) =>
    (nodeSecretFileVariables as readonly string[]).includes(name);

/** Addresses the rollups node listens on, all on the loopback interface. */
export type NodePorts = {
    inspect: number;
    jsonrpc: number;
    telemetry: number;
};

export type NodeOptions = {
    anvilUrl: string;
    cartesiEnvironmentVariables?: CartesiEnvironmentVariables;
    /**
     * whether the node submits claims, the default; with a sling claimer it
     * runs in reader mode, following the tournaments and recording settled
     * epochs with no PRT signer
     */
    claimSubmission?: boolean;
    /** Directory relative key file paths are resolved against. */
    cwd?: string;
    databaseUrl: string;
    defaultBlock?: "latest" | "safe" | "finalized";
    forkChainId?: number;
    logLevel?: "info" | "debug" | "warn" | "error" | "fatal";
    mnemonic?: string;
    ports: NodePorts;
    prt?: boolean;
    /** Directory of the machine snapshots, the project's `.cartesi`. */
    snapshotsDir: string;
};

/**
 * Environment of the rollups node, which `cartesi-rollups-cli` runs with too,
 * as it did inside the node container: the defaults of the devnet, overridden
 * by the allowed `CARTESI_` variables of the host.
 */
export const nodeEnvironment = (
    options: NodeOptions,
): Record<string, string> => {
    const {
        anvilUrl,
        cwd = process.cwd(),
        databaseUrl,
        defaultBlock = "latest",
        logLevel = "info",
        mnemonic = DEVNET_MNEMONIC,
        ports,
        prt = false,
        snapshotsDir,
    } = options;
    const claimSubmission = options.claimSubmission ?? true;
    const chainId = (options.forkChainId ??
        DEVNET_CHAIN_ID) as keyof typeof daveAppFactoryAddress;

    const chainDaveAppFactoryAddress: string | undefined = prt
        ? daveAppFactoryAddress[chainId]
        : undefined;

    const defaultVars: Record<string, string> = {
        CARTESI_AUTH_MNEMONIC: mnemonic,
        // First account generated by the devnet test mnemonic 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
        CARTESI_AUTH_MNEMONIC_ACCOUNT_INDEX: "0",
        CARTESI_BLOCKCHAIN_DEFAULT_BLOCK: defaultBlock,
        CARTESI_BLOCKCHAIN_HTTP_ENDPOINT: anvilUrl,
        CARTESI_BLOCKCHAIN_ID: DEVNET_CHAIN_ID.toString(),
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
        CARTESI_DATABASE_CONNECTION: databaseUrl,
        CARTESI_LOG_LEVEL: logLevel,
        // The node always starts its PRT service, and with claim submission
        // enabled by default that service needs its own signer. PRT has no
        // default mnemonic, so the devnet one is supplied explicitly. With a
        // sling claimer the node reads instead, and needs no PRT signer.
        ...(claimSubmission
            ? { CARTESI_PRT_AUTH_MNEMONIC: mnemonic }
            : { CARTESI_FEATURE_CLAIM_SUBMISSION_ENABLED: "false" }),
        CARTESI_SNAPSHOTS_DIR: snapshotsDir,
    };

    const hostVars = Object.fromEntries(
        Object.entries(
            getNodeAllowedVariables(options.cartesiEnvironmentVariables),
        )
            // a reader-mode node has no PRT signer, so the host's is dropped
            .filter(([name]) => claimSubmission || !isPrtAuthVariable(name))
            // the node may run from another directory than the project's
            .map(([name, value]) => [
                name,
                isSecretFileVariable(name) ? path.resolve(cwd, value) : value,
            ]),
    );

    // what the container did on its own: every address its own, now shared
    // with the host, on a port of the environment
    const hostOnly: Record<string, string> = {
        CARTESI_INSPECT_ADDRESS: `127.0.0.1:${ports.inspect}`,
        CARTESI_JSONRPC_API_ADDRESS: `127.0.0.1:${ports.jsonrpc}`,
        CARTESI_LOG_COLOR: "false",
        CARTESI_NODE_TELEMETRY_ADDRESS: `127.0.0.1:${ports.telemetry}`,
    };

    // Merge default and host environment variables, with host variables taking precedence
    return { ...defaultVars, ...hostVars, ...hostOnly };
};

export const nodeProcess = (env: Record<string, string>): ProcessSpec => ({
    args: [],
    command: "cartesi-rollups-node",
    env,
    name: NODE_SERVICE,
});
