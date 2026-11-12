import type { Address } from "viem";
import { anvil } from "viem/chains";
import type { ResolvedPrtNode } from "../prt.js";
import type { ComposeFile, Service } from "../types/compose.js";
import { fileSecret, secretInitService } from "./secrets.js";

/**
 * The compose services of the PRT nodes the CLI runs: one sling node per
 * [prt.nodes.<label>] entry with `type = "sling"`. They are composed after
 * the deploy, since each one needs the application's address.
 */

export type PrtNodeServiceOptions = {
    application: Address;
    /** anvil's block time, which sets how often a node polls the chain */
    blockTime: number;
    imageTag?: string;
    nodes: ResolvedPrtNode[];
};

/** The compose service of an entry, which its label names. */
export const prtNodeServiceName = (label: string) => `prt-node-${label}`;

/**
 * The service that installs an entry's key file. Named outside the nodes'
 * `prt-node-` space, since a label may hold a `-`, so no label can produce
 * the installer's name of another node.
 */
const prtNodeInitServiceName = (label: string) =>
    `secret-init-${prtNodeServiceName(label)}`;

/** Whether a compose service is a PRT node the CLI runs, as `cartesi logs` lists them. */
export const isPrtNodeService = (service: string): boolean =>
    service.startsWith(prtNodeServiceName(""));

const prtNodeSecretsVolume = (label: string) =>
    `prt_node_${label.replaceAll("-", "_")}_secrets`;

/**
 * The directory of the runtime image its user can write to; a recreated
 * container starts clean, for the application it is deployed for.
 */
const DATA_DIR = "/var/lib/cartesi-rollups-node/snapshots";

/** Where the node reads the built machine, the same files the rollups-node deploys. */
const TEMPLATE_DIR = "/var/lib/cartesi-rollups-node/template";

/** The key of an entry on a devnet account, which resolution always sets. */
const privateKeyOf = (node: ResolvedPrtNode): string => {
    if (node.privateKey === undefined) {
        throw new Error(
            `${node.role} ${node.label} ${node.address} has no key to run with`,
        );
    }
    return node.privateKey;
};

const sling = (
    options: PrtNodeServiceOptions,
    node: ResolvedPrtNode,
): ComposeFile => {
    const { application, blockTime, imageTag = "latest" } = options;
    const { label } = node;
    const image = `cartesi/rollups-runtime:${imageTag}`;
    const secret =
        node.source.kind === "key-file"
            ? fileSecret(prtNodeServiceName(label), node.source.path)
            : undefined;

    const service: Service = {
        image,
        init: true,
        depends_on: {
            anvil: { condition: "service_healthy" },
            ...(secret && {
                [prtNodeInitServiceName(label)]: {
                    condition: "service_completed_successfully",
                },
            }),
        },
        // the signer never comes from the command line
        command: ["cartesi-sling-node", "pk"],
        environment: {
            CARTESI_SLING_APP_ADDRESS: application,
            CARTESI_SLING_BLOCKCHAIN_HTTP_ENDPOINT: "http://anvil:8545",
            CARTESI_SLING_BLOCKCHAIN_ID: anvil.id.toString(),
            CARTESI_SLING_DATA_DIR: DATA_DIR,
            CARTESI_SLING_POLLING_INTERVAL: Math.max(1, blockTime).toString(),
            CARTESI_SLING_TEMPLATE_PATH: `${TEMPLATE_DIR}/image`,
            ...(secret
                ? { CARTESI_SLING_AUTH_PRIVATE_KEY_FILE: secret.target }
                : // a devnet account's key is public, so it can go in the environment
                  { CARTESI_SLING_AUTH_PRIVATE_KEY: privateKeyOf(node) }),
        },
        volumes: [
            `./.cartesi:${TEMPLATE_DIR}:ro`,
            ...(secret
                ? [`${prtNodeSecretsVolume(label)}:/run/secrets:ro`]
                : []),
        ],
    };

    return {
        services: {
            [prtNodeServiceName(label)]: service,
            ...(secret && {
                [prtNodeInitServiceName(label)]: secretInitService({
                    imageTag,
                    secrets: [secret],
                    volume: prtNodeSecretsVolume(label),
                }),
            }),
        },
        ...(secret && {
            volumes: { [prtNodeSecretsVolume(label)]: {} },
        }),
    };
};

/** The compose files of the PRT nodes the CLI runs, one per type it knows. */
export default (options: PrtNodeServiceOptions): ComposeFile[] =>
    options.nodes.flatMap((node) => {
        switch (node.type) {
            case "sling":
                return [sling(options, node)];
            default:
                return [];
        }
    });
