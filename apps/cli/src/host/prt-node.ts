import path from "node:path";
import type { Address } from "viem";
import type { ResolvedPrtNode } from "../prt.js";
import { DEVNET_CHAIN_ID } from "./anvil.js";
import type { ProcessSpec } from "./process.js";

/**
 * The processes of the PRT nodes the CLI runs: one sling node per
 * [prt.nodes.<label>] entry with `type = "sling"`. They are started after
 * the deploy, since each one needs the application's address.
 */

export type PrtNodeOptions = {
    anvilUrl: string;
    application: Address;
    /** anvil's block time, which sets how often a node polls the chain */
    blockTime: number;
    /** Directory relative key file paths are resolved against. */
    cwd?: string;
    /** Directory of the environment, the nodes keep their data under it. */
    dir: string;
    nodes: ResolvedPrtNode[];
    /** Machine snapshot the application is deployed from. */
    templatePath: string;
};

/** The service of an entry, which its label names. */
export const prtNodeServiceName = (label: string) => `prt-node-${label}`;

/** Whether a service is a PRT node the CLI runs, as `cartesi logs` lists them. */
export const isPrtNodeService = (service: string): boolean =>
    service.startsWith(prtNodeServiceName(""));

/** Data directory of a node, its own for every deploy. */
export const prtNodeDataDir = (
    dir: string,
    label: string,
    application: Address,
) => path.join(dir, "prt", label, application);

/** The key of an entry on a devnet account, which resolution always sets. */
const privateKeyOf = (node: ResolvedPrtNode): string => {
    if (node.privateKey === undefined) {
        throw new Error(
            `${node.sentry ? "sentry" : "validator"} ${node.label} ${node.address} has no key to run with`,
        );
    }
    return node.privateKey;
};

const sling = (options: PrtNodeOptions, node: ResolvedPrtNode): ProcessSpec => {
    const {
        anvilUrl,
        application,
        blockTime,
        cwd = process.cwd(),
        dir,
    } = options;
    const { label } = node;
    return {
        // the signer never comes from the command line
        args: ["pk"],
        command: "cartesi-sling-node",
        env: {
            CARTESI_SLING_APP_ADDRESS: application,
            CARTESI_SLING_BLOCKCHAIN_HTTP_ENDPOINT: anvilUrl,
            CARTESI_SLING_BLOCKCHAIN_ID: DEVNET_CHAIN_ID.toString(),
            CARTESI_SLING_DATA_DIR: prtNodeDataDir(dir, label, application),
            CARTESI_SLING_POLLING_INTERVAL: Math.max(1, blockTime).toString(),
            CARTESI_SLING_TEMPLATE_PATH: options.templatePath,
            // the node runs on the host, so it reads the key file the host has
            ...(node.source.kind === "key-file"
                ? {
                      CARTESI_SLING_AUTH_PRIVATE_KEY_FILE: path.resolve(
                          cwd,
                          node.source.path,
                      ),
                  }
                : // a devnet account's key is public, so it can go in the environment
                  { CARTESI_SLING_AUTH_PRIVATE_KEY: privateKeyOf(node) }),
        },
        name: prtNodeServiceName(label),
    };
};

/** The processes of the PRT nodes the CLI runs, one per type it knows. */
export const prtNodeProcesses = (options: PrtNodeOptions): ProcessSpec[] =>
    options.nodes.flatMap((node) => {
        switch (node.type) {
            case "sling":
                return [sling(options, node)];
            default:
                return [];
        }
    });
