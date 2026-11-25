import path from "node:path";
import type { Address } from "viem";
import { anvil } from "viem/chains";
import type { ResolvedPrtNode } from "../prt.js";
import type { ComposeFile, Service } from "../types/compose.js";
import { escapeComposeValue } from "./common.js";
import { fileSecret, RUNTIME_USER, secretInitService } from "./secrets.js";

/**
 * The compose services of the PRT nodes the CLI runs: a sling node per
 * [prt.nodes.<label>] entry with `type = "sling"`, a crisium player per entry
 * with `type = "crisium"`. They are composed after the deploy, since each one
 * needs the application's address.
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
 * The service that installs an entry's key file, or prepares a crisium node's
 * data. Named outside the nodes' `prt-node-` space, since a label may hold a
 * `-`, so no label can produce the installer's name of another node.
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

/** The chain as the containers reach it; anvil serves WebSocket on the same port. */
const RPC_URL = "http://anvil:8545";
const WS_URL = "ws://anvil:8545";

/**
 * The crisium player and its recipes in the runtime image, and the dave
 * contract artifacts it reads (`packages/sdk/Dockerfile`).
 */
const RECIPES_DIR = "/opt/prt/recipes";
const DAVE_DIR = "/opt/dave";
const CRISIUM = `${RECIPES_DIR}/crisium.lua`;
/**
 * Where an entry's anomaly handler is mounted, read-only: the directory of the
 * file it names, whole, so the module may `require` helpers next to it. Only
 * the node service mounts it; the init service runs no player.
 */
const HANDLER_DIR = "/opt/prt/handler";
/**
 * The recipes require each other by module name, so lua finds them here. The
 * handler's directory comes after them, so no file of it shadows a recipe.
 */
const luaPath = (handler?: string): string =>
    `${[RECIPES_DIR, ...(handler === undefined ? [] : [HANDLER_DIR])]
        .map((dir) => `${dir}/?.lua`)
        .join(";")};;`;
const LUA_PATH = luaPath();

/**
 * A crisium node's volume, its data directory: its state and checkpoints, and
 * for a validator the keystore cast signs with. The init service fills it, as
 * root, and hands it to the runtime user.
 */
const prtNodeDataVolume = (label: string) =>
    `prt_node_${label.replaceAll("-", "_")}_data`;
const STATE_DIR = `${DATA_DIR}/state`;
const CHECKPOINTS_DIR = `${DATA_DIR}/checkpoints`;
const KEYSTORE_DIR = `${DATA_DIR}/keystore`;
const PASSWORD_FILE = `${DATA_DIR}/password`;

/**
 * The init's helper in the runtime image: stores the checkpoint a crisium node
 * starts epoch 0 from, the template with an empty output history, laid out as
 * the player's own checkpoints are. It lives next to the recipes it calls,
 * since the checkpoint format moves with them.
 */
const INIT_SCRIPT = "/opt/prt/store-first-checkpoint.lua";
/** A devnet account's key, for the init service that imports it; public. */
const INIT_KEY_VARIABLE = "PRT_NODE_PRIVATE_KEY";

/** The key of an entry on a devnet account, which resolution always sets. */
const privateKeyOf = (node: ResolvedPrtNode): string => {
    if (node.privateKey === undefined) {
        throw new Error(
            `${node.sentry ? "sentry" : "validator"} ${node.label} ${node.address} has no key to run with`,
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

/** The player's command line: what the CLI knows, then the entry's settings. */
const crisiumArgs = (
    options: PrtNodeServiceOptions,
    node: ResolvedPrtNode,
): string[] => {
    const { application, blockTime } = options;
    const { label } = node;
    const settings = node.crisium ?? { mode: "sentinel" };
    const validator = settings.mode === "validator";
    return [
        "lua5.4",
        CRISIUM,
        `--rpc=${RPC_URL}`,
        `--ws=${WS_URL}`,
        `--application=${application}`,
        `--label=${label}`,
        `--poll-interval=${Math.max(1, blockTime)}`,
        `--dave=${DAVE_DIR}`,
        `--state=${STATE_DIR}`,
        `--checkpoints=${CHECKPOINTS_DIR}`,
        `--mode=${settings.mode}`,
        ...(validator
            ? [
                  `--kind=${settings.kind ?? "honest"}`,
                  `--keystore=${KEYSTORE_DIR}/${prtNodeServiceName(label)}`,
                  `--password-file=${PASSWORD_FILE}`,
              ]
            : []),
        ...(settings.warningBlocks !== undefined
            ? [`--warning-blocks=${settings.warningBlocks}`]
            : []),
        ...(settings.inputPolicy !== undefined
            ? [`--input-policy=${settings.inputPolicy}`]
            : []),
        ...(settings.disputePolicy !== undefined
            ? [`--dispute-policy=${settings.disputePolicy}`]
            : []),
        // the file's base name is a module name, so it is safe as an argument
        ...(settings.anomalyHandler !== undefined
            ? [
                  `--anomaly-handler=${path.basename(settings.anomalyHandler, ".lua")}`,
              ]
            : []),
    ];
};

/** The bind mount of an entry's anomaly handler: its directory, read-only. */
const handlerMount = (handler: string) => ({
    type: "bind" as const,
    source: escapeComposeValue(path.dirname(handler)),
    target: HANDLER_DIR,
    read_only: true,
    bind: { create_host_path: false },
});

/**
 * The service that fills a crisium node's volume before each run: the
 * checkpoint of epoch 0 from the template, and for a validator a keystore made
 * from its key, with a password drawn here, both for the runtime user only. Its
 * command names the application, so a redeploy recreates it and starts the
 * volume clean, while a restart keeps the state. Unlike the key file installer
 * it needs the chain, for the geometry.
 */
const crisiumInitService = (
    options: PrtNodeServiceOptions,
    node: ResolvedPrtNode,
    secret: ReturnType<typeof fileSecret> | undefined,
): Service => {
    const { application, imageTag = "latest" } = options;
    const { label } = node;
    const service = prtNodeServiceName(label);
    const validator = node.crisium?.mode === "validator";
    const key =
        secret === undefined
            ? `"$${INIT_KEY_VARIABLE}"`
            : `"$(head -n 1 ${secret.source.target} | tr -d '[:space:]')"`;
    const command = [
        "find /dst -mindepth 1 -delete",
        `install -d -o ${RUNTIME_USER} -g ${RUNTIME_USER} /dst/state /dst/checkpoints`,
        `lua5.4 ${INIT_SCRIPT} ${RPC_URL} ${application} ${TEMPLATE_DIR}/image ${DAVE_DIR} /dst/checkpoints/epoch-0`,
        ...(validator
            ? [
                  "install -d -m 0700 /dst/keystore",
                  "od -An -N16 -tx1 /dev/urandom | tr -d ' \\n' > /dst/password",
                  `cast wallet import ${service} --keystore-dir /dst/keystore --private-key ${key} --unsafe-password "$(cat /dst/password)" > /dev/null`,
              ]
            : []),
        `chown -R ${RUNTIME_USER}:${RUNTIME_USER} /dst`,
        ...(validator
            ? [`chmod 0400 /dst/keystore/${service} /dst/password`]
            : []),
    ].join("\n");

    return {
        image: `cartesi/rollups-runtime:${imageTag}`,
        user: "root",
        restart: "no",
        depends_on: { anvil: { condition: "service_healthy" } },
        entrypoint: ["sh", "-ec"],
        command: [escapeComposeValue(command)],
        environment: {
            LUA_PATH,
            ...(validator &&
                secret === undefined && {
                    // a devnet account's key is public, so it can go in the environment
                    [INIT_KEY_VARIABLE]: privateKeyOf(node),
                }),
        },
        volumes: [
            ...(secret ? [secret.source] : []),
            `./.cartesi:${TEMPLATE_DIR}:ro`,
            `${prtNodeDataVolume(label)}:/dst`,
        ],
    };
};

const crisium = (
    options: PrtNodeServiceOptions,
    node: ResolvedPrtNode,
): ComposeFile => {
    const { imageTag = "latest" } = options;
    const { label } = node;
    const secret =
        node.source.kind === "key-file"
            ? fileSecret(prtNodeServiceName(label), node.source.path)
            : undefined;
    const handler = node.crisium?.anomalyHandler;

    const service: Service = {
        image: `cartesi/rollups-runtime:${imageTag}`,
        // lua as PID 1 would ignore the stop signal
        init: true,
        depends_on: {
            anvil: { condition: "service_healthy" },
            [prtNodeInitServiceName(label)]: {
                condition: "service_completed_successfully",
            },
        },
        command: crisiumArgs(options, node),
        environment: { LUA_PATH: luaPath(handler) },
        volumes: [
            `${prtNodeDataVolume(label)}:${DATA_DIR}`,
            ...(handler === undefined ? [] : [handlerMount(handler)]),
        ],
    };

    return {
        services: {
            [prtNodeServiceName(label)]: service,
            [prtNodeInitServiceName(label)]: crisiumInitService(
                options,
                node,
                secret,
            ),
        },
        volumes: { [prtNodeDataVolume(label)]: {} },
    };
};

/** The compose files of the PRT nodes the CLI runs, one per type it knows. */
export default (options: PrtNodeServiceOptions): ComposeFile[] =>
    options.nodes.flatMap((node) => {
        switch (node.type) {
            case "sling":
                return [sling(options, node)];
            case "crisium":
                return [crisium(options, node)];
            default:
                return [];
        }
    });
