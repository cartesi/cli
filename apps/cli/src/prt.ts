import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import {
    type Address,
    type Hex,
    isAddressEqual,
    isHex,
    parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DEVNET_MNEMONIC } from "./compose/node.js";
import {
    InvalidPrtConfigError,
    type PrtNode,
    type PrtOptions,
} from "./config.js";
import { prtNodeTable } from "./config/toml/prt.js";
import {
    DEFAULT_SENDER_INDEX,
    DEVNET_ACCOUNTS,
    findMnemonicAccountIndex,
    getDevnetAccount,
} from "./wallet.js";

/**
 * The PRT pool: devnet accounts a [prt.nodes.<label>] entry gets when it names none, in file
 * order. They come after the accounts anvil funds (0 to 9), which the node, the CLI and the
 * developer use, so a pool account shares nonces with nothing else.
 */
export const PRT_POOL_START = 20;
export const PRT_POOL_SIZE = 10;

/** What `cartesi run` gives each pool account: what anvil gives its own accounts. */
export const PRT_FUNDING = parseEther("10000");

/**
 * Devnet accounts the node signs with: the claimer (`CARTESI_AUTH_MNEMONIC_ACCOUNT_INDEX`,
 * set by the CLI) and the PRT submitter (the node's `CARTESI_PRT_AUTH_MNEMONIC_ACCOUNT_INDEX`
 * default), which the node has only when it claims (the reference entry's `claim`).
 */
const NODE_CLAIMER_INDEX = 0;
const NODE_PRT_INDEX = 6;

/** Where an entry's address came from. */
export type PrtNodeSource =
    | { kind: "pool"; index: number } // a devnet account of the PRT pool
    | { kind: "devnet"; index: number } // another devnet account, named in the entry
    | { kind: "key-file"; path: string } // the developer's own key, read from a file
    | { kind: "external" }; // an address of the developer's own

export type ResolvedPrtNode = {
    label: string;
    address: Address;
    /** the node the CLI runs, the sling node; none for an appointed-only entry */
    type?: "sling";
    sentry: boolean;
    /** 1-based position among the sentries, in file order: the sentry's ID on the consensus */
    sentryId?: number;
    source: PrtNodeSource;
    /** the key the CLI runs the node with; only for a devnet account, whose key is public */
    privateKey?: Hex;
};

/** The rollups-node's entry, implied when the config has none. */
export type ResolvedReference = {
    /** the entry's label, when the config spells it */
    label?: string;
    /** whether the node submits claims; false is reader mode */
    claim: boolean;
};

export type ResolvedPrt = {
    sentryManager?: Address;
    reference: ResolvedReference;
    /** every entry but the reference node, in file order */
    nodes: ResolvedPrtNode[];
    warnings: string[];
};

const isPoolIndex = (index: number) =>
    index >= PRT_POOL_START && index < PRT_POOL_START + PRT_POOL_SIZE;

const devnetIndexOf = (address: Address): number | undefined =>
    findMnemonicAccountIndex({
        address,
        max: DEVNET_ACCOUNTS,
        mnemonic: DEVNET_MNEMONIC,
    });

const sourceOf = (address: Address): PrtNodeSource => {
    const index = devnetIndexOf(address);
    if (index === undefined) {
        return { kind: "external" };
    }
    return { kind: isPoolIndex(index) ? "pool" : "devnet", index };
};

const PRIVATE_KEY_PATTERN = /^(0x)?[0-9a-fA-F]{64}$/;

/**
 * Reads an entry's key file: its first line is a 32-byte hex private key, with or without
 * `0x`, the format the sling node reads. The key is never part of an error.
 * @param file path as given in the config, relative to the project directory
 */
export const readKeyFile = (file: string, where: string): Hex => {
    let content: string;
    try {
        content = fs.readFileSync(path.resolve(file), "utf8");
    } catch {
        throw new InvalidPrtConfigError(
            `private_key_file "${file}" can't be read`,
            where,
        );
    }
    const [firstLine = ""] = content.split("\n");
    const key = firstLine.trim();
    if (!PRIVATE_KEY_PATTERN.test(key)) {
        throw new InvalidPrtConfigError(
            `the first line of private_key_file "${file}" must be a hex private key, 64 hex digits with or without 0x`,
            where,
        );
    }
    return (isHex(key) ? key : `0x${key}`) as Hex;
};

/**
 * Resolves an entry that brings its own key: the address is the key's, and must match
 * `address` when both are set. The devnet accounts' keys are public and derived by the CLI,
 * so a file holding one is a mistake.
 */
const resolveKeyFile = (
    node: PrtNode,
    where: string,
): { address: Address; source: PrtNodeSource } => {
    const file = node.privateKeyFile as string;
    const { address } = privateKeyToAccount(readKeyFile(file, where));
    const devnetIndex = devnetIndexOf(address);
    if (devnetIndex !== undefined) {
        throw new InvalidPrtConfigError(
            `private_key_file "${file}" holds the key of devnet account ${devnetIndex}, which the CLI derives itself. Drop the file, or set the address instead`,
            where,
        );
    }
    if (node.address !== undefined && !isAddressEqual(node.address, address)) {
        throw new InvalidPrtConfigError(
            `private_key_file "${file}" is the key of ${address}, not ${node.address}`,
            where,
        );
    }
    return { address, source: { kind: "key-file", path: file } };
};

/**
 * Gives every [prt.nodes.<label>] entry its address: the one it names, the one of its key
 * file, or else the next free account of the PRT pool, in file order. Pool accounts named by
 * an entry are skipped, so no two entries share an address. The reference entry takes none,
 * since the node runs on its own devnet accounts. Needs no chain, so it runs before anything
 * starts, `--dry-run` included.
 * @param options.guardian the application's guardian, which an entry shouldn't share nonces with
 * @throws InvalidPrtConfigError when the pool runs out, a key file is unusable, or an entry
 * the CLI runs is an account the node signs with
 */
export const resolvePrtNodes = (
    prt: PrtOptions,
    options: { guardian?: Address } = {},
): ResolvedPrt => {
    const warnings: string[] = [];
    const referenceEntry = Object.entries(prt.nodes).find(
        ([, { type }]) => type === "reference",
    );
    const reference: ResolvedReference = {
        ...(referenceEntry && { label: referenceEntry[0] }),
        claim: referenceEntry?.[1].claim ?? true,
    };
    const entries = Object.entries(prt.nodes).filter(
        ([, { type }]) => type !== "reference",
    );
    const named = new Set(
        entries.flatMap(([, { address }]) =>
            address === undefined ? [] : [address.toLowerCase()],
        ),
    );
    let next = PRT_POOL_START;
    let sentries = 0;

    const nodes = entries.map(([label, node]): ResolvedPrtNode => {
        const where = prtNodeTable(label);
        const resolved = {
            label,
            ...(node.type === "sling" && { type: node.type }),
            sentry: node.sentry,
            ...(node.sentry && { sentryId: ++sentries }),
        };
        if (node.privateKeyFile !== undefined) {
            return { ...resolved, ...resolveKeyFile(node, where) };
        }
        if (node.address !== undefined) {
            const source = sourceOf(node.address);
            if (node.type !== undefined && source.kind === "external") {
                throw new InvalidPrtConfigError(
                    `the CLI has no key for ${node.address}: set private_key_file to run the node with it, or drop the type to appoint it only`,
                    where,
                );
            }
            return {
                ...resolved,
                address: node.address,
                source,
                ...(node.type !== undefined &&
                    source.kind !== "external" &&
                    source.kind !== "key-file" && {
                        privateKey: getDevnetAccount(source.index).privateKey,
                    }),
            };
        }
        while (
            isPoolIndex(next) &&
            named.has(getDevnetAccount(next).address.toLowerCase())
        ) {
            next++;
        }
        if (!isPoolIndex(next)) {
            throw new InvalidPrtConfigError(
                `needs an address: the PRT pool, devnet accounts ${PRT_POOL_START} to ${PRT_POOL_START + PRT_POOL_SIZE - 1}, is used up`,
                where,
            );
        }
        const poolIndex = next++;
        const { address, privateKey } = getDevnetAccount(poolIndex);
        return {
            ...resolved,
            address,
            source: { kind: "pool", index: poolIndex },
            privateKey,
        };
    });

    // a key file's address is known only now
    nodes.forEach((node, index) => {
        const same = nodes.find(
            (other, i) =>
                i < index && isAddressEqual(other.address, node.address),
        );
        if (same !== undefined) {
            throw new InvalidPrtConfigError(
                `address ${node.address} is also the address of ${prtNodeTable(same.label)}`,
                prtNodeTable(node.label),
            );
        }
    });

    // a node the CLI runs sends its own transactions, so it can't be an account the node
    // sends from. Sharing one with the guardian or the default sender only risks a collision
    for (const node of nodes) {
        if (node.type === undefined || node.source.kind === "pool") {
            continue;
        }
        const where = prtNodeTable(node.label);
        if (node.source.kind === "devnet") {
            if (node.source.index === NODE_CLAIMER_INDEX) {
                throw new InvalidPrtConfigError(
                    `devnet account ${NODE_CLAIMER_INDEX} signs the node's claims, so it can't also run ${where}`,
                    where,
                );
            }
            if (reference.claim && node.source.index === NODE_PRT_INDEX) {
                throw new InvalidPrtConfigError(
                    `devnet account ${NODE_PRT_INDEX} signs the node's PRT transactions, so it can't also run ${where}`,
                    where,
                );
            }
            if (node.source.index === DEFAULT_SENDER_INDEX) {
                warnings.push(
                    `${where} is devnet account ${DEFAULT_SENDER_INDEX}, the default sender of cartesi send and deposit, so their transactions may collide`,
                );
            }
        }
        if (
            options.guardian !== undefined &&
            isAddressEqual(node.address, options.guardian)
        ) {
            warnings.push(
                `${where} is the guardian of the application, so its transactions may collide with an emergency withdrawal`,
            );
        }
    }

    if (prt.sentryManager !== undefined && sentries === 0) {
        warnings.push(
            "[prt].sentry_manager is set but no [prt.nodes] entry is a sentry, so the manager has no sentries to rotate",
        );
    }

    // PRT is permissionless, so a claimer may run outside the CLI, but a devnet with
    // nothing claiming settles no epoch
    const slings = nodes.filter(({ type }) => type === "sling");
    if (!reference.claim && slings.length === 0) {
        warnings.push(
            `nothing the CLI runs claims: ${prtNodeTable(reference.label as string)} has claim = false and no entry has type = "sling", so a claimer must run elsewhere`,
        );
    }
    // the consensus accepts a staged result once every sentry voted for it, and a sling
    // sentry votes for its own claim
    const appointed = nodes.filter(({ sentry }) => sentry);
    if (
        !reference.claim &&
        appointed.length > 0 &&
        appointed.every(({ type }) => type === "sling")
    ) {
        warnings.push(
            "every sentry is a sling node the CLI runs and the rollups-node reads, so a claim is accepted as soon as its own authors vote for it",
        );
    }

    return { sentryManager: prt.sentryManager, reference, nodes, warnings };
};

/**
 * The warning for a reference entry whose `claim` changed between a startup and a rebuild:
 * the rollups-node saves its submission mode in its database at the first start and refuses
 * the other mode on it, so the change needs a fresh `cartesi run`. The sling entries are free
 * to change, their containers are recreated on every rebuild.
 * @returns the warning, or undefined when the mode is what it was
 */
export const readerModeChanged = (
    before: ResolvedPrt | undefined,
    after: ResolvedPrt | undefined,
): string | undefined => {
    const was = before?.reference.claim ?? true;
    const now = after?.reference.claim ?? true;
    if (was === now) {
        return undefined;
    }
    return `the rollups-node's claim setting changed to claim = ${now} in cartesi.toml. Restart cartesi run to apply it. This rebuild keeps the [prt] setup it started with.`;
};

/** The sentries, in ID order: what the deploy appoints on the consensus. */
export const sentriesOf = (prt: ResolvedPrt): ResolvedPrtNode[] =>
    prt.nodes.filter(({ sentry }) => sentry);

/** The entries the CLI runs a node for. */
export const runnableNodes = (prt: ResolvedPrt): ResolvedPrtNode[] =>
    prt.nodes.filter(({ type }) => type !== undefined);

/**
 * The chain calls `checkPrtNodes` makes, so it can run against a fake client in tests.
 */
export type PrtClient = {
    getBalance: (args: { address: Address }) => Promise<bigint>;
    setBalance: (args: { address: Address; value: bigint }) => Promise<void>;
};

/**
 * Funds the pool accounts and checks that the other nodes the CLI runs have ETH to send
 * their transactions with. Runs once anvil is healthy, before the deploy, and again before a
 * redeploy: the balance is set, not added to, so repeating it changes nothing.
 * @throws when a node of the developer's own has no ETH, which the CLI never gives it
 */
export const checkPrtNodes = async (
    client: PrtClient,
    prt: ResolvedPrt,
): Promise<void> => {
    for (const node of runnableNodes(prt)) {
        if (node.source.kind === "pool") {
            await client.setBalance({
                address: node.address,
                value: PRT_FUNDING,
            });
            continue;
        }
        const balance = await client.getBalance({ address: node.address });
        if (balance === 0n) {
            throw new Error(
                `${node.sentry ? "sentry" : "validator"} ${node.label} ${node.address} has no ETH on this devnet. Fund it before cartesi run, e.g. with cast rpc anvil_setBalance`,
            );
        }
    }
};

/** The rollups-node's line: what its entry says it does. */
export const describeReference = (prt: ResolvedPrt): string =>
    prt.reference.claim
        ? "rollups-node claims"
        : "rollups-node reads (claim = false, no PRT signer)";

/**
 * One line per entry: sentry with its ID or validator, its label and its full address, so it
 * can be copied into other tools. The note says what the CLI does with the entry, then where
 * its account comes from.
 */
export const describePrtNode = (node: ResolvedPrtNode): string => {
    const { source } = node;
    const account =
        source.kind === "pool"
            ? `devnet account ${source.index}, funded by the CLI`
            : source.kind === "devnet"
              ? `devnet account ${source.index}`
              : source.kind === "key-file"
                ? `key in ${source.path}`
                : undefined;
    const origin =
        node.type === undefined
            ? ["appointed only", ...(account ? [account] : [])].join(", ")
            : (account ?? "");
    const kind = node.sentry ? `sentry ${node.sentryId}` : "validator";
    return `${kind} ${chalk.cyan(node.label)} ${node.address} ${chalk.dim(`(${origin})`)}`;
};
