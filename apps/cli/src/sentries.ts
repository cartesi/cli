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
    type PrtOptions,
    type PrtSentry,
    type SentryType,
} from "./config.js";
import { sentryEntry, sentryLabel } from "./config/toml/prt.js";
import {
    DEFAULT_SENDER_INDEX,
    DEVNET_ACCOUNTS,
    findMnemonicAccountIndex,
    getDevnetAccount,
} from "./wallet.js";

/**
 * The sentry pool: devnet accounts a [[prt.sentries]] entry gets when it names none. They
 * come after the accounts anvil funds (0 to 9), which the node, the CLI and the developer use,
 * so a pool sentry shares nonces with nothing else.
 */
export const SENTRY_POOL_START = 20;
export const SENTRY_POOL_SIZE = 10;

/** What `cartesi run` gives each pool sentry: what anvil gives its own accounts. */
export const SENTRY_FUNDING = parseEther("10000");

/**
 * Devnet accounts the node signs with: the claimer (`CARTESI_AUTH_MNEMONIC_ACCOUNT_INDEX`,
 * set by the CLI) and the PRT submitter (the node's `CARTESI_PRT_AUTH_MNEMONIC_ACCOUNT_INDEX`
 * default).
 */
const NODE_CLAIMER_INDEX = 0;
const NODE_PRT_INDEX = 6;

/** Where a sentry's address came from. */
export type SentrySource =
    | { kind: "pool"; index: number } // a devnet account of the sentry pool
    | { kind: "devnet"; index: number } // another devnet account, named in the entry
    | { kind: "key-file"; path: string } // the developer's own key, read from a file
    | { kind: "external" }; // an address of the developer's own

export type ResolvedSentry = {
    entry: number; // 1-based position, the sentry's ID on the consensus
    label: string;
    address: Address;
    type?: SentryType;
    source: SentrySource;
    /** the key the CLI runs the sentry with; only for a devnet account, whose key is public */
    privateKey?: Hex;
};

export type ResolvedPrt = {
    sentryManager?: Address;
    sentries: ResolvedSentry[];
    warnings: string[];
};

const isPoolIndex = (index: number) =>
    index >= SENTRY_POOL_START && index < SENTRY_POOL_START + SENTRY_POOL_SIZE;

const devnetIndexOf = (address: Address): number | undefined =>
    findMnemonicAccountIndex({
        address,
        max: DEVNET_ACCOUNTS,
        mnemonic: DEVNET_MNEMONIC,
    });

const sourceOf = (address: Address): SentrySource => {
    const index = devnetIndexOf(address);
    if (index === undefined) {
        return { kind: "external" };
    }
    return { kind: isPoolIndex(index) ? "pool" : "devnet", index };
};

const PRIVATE_KEY_PATTERN = /^(0x)?[0-9a-fA-F]{64}$/;

/**
 * Reads a sentry's key file: its first line is a 32-byte hex private key, with or without
 * `0x`, the format the sling node reads. The key is never part of an error.
 * @param file path as given in the config, relative to the project directory
 */
export const readSentryKeyFile = (file: string, where: string): Hex => {
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
    sentry: PrtSentry,
    index: number,
): { address: Address; source: SentrySource } => {
    const file = sentry.privateKeyFile as string;
    const where = sentryEntry(index);
    const { address } = privateKeyToAccount(readSentryKeyFile(file, where));
    const devnetIndex = devnetIndexOf(address);
    if (devnetIndex !== undefined) {
        throw new InvalidPrtConfigError(
            `private_key_file "${file}" holds the key of devnet account ${devnetIndex}, which the CLI derives itself; drop the file, or set the address instead`,
            where,
        );
    }
    if (
        sentry.address !== undefined &&
        !isAddressEqual(sentry.address, address)
    ) {
        throw new InvalidPrtConfigError(
            `private_key_file "${file}" is the key of ${address}, not ${sentry.address}`,
            where,
        );
    }
    return { address, source: { kind: "key-file", path: file } };
};

/**
 * Gives every [[prt.sentries]] entry its address: the one it names, the one of its key file,
 * or else the next free account of the sentry pool, in entry order. Pool accounts named by an
 * entry are skipped, so no two sentries share an address. Needs no chain, so it runs before
 * anything starts, `--dry-run` included.
 * @param options.guardian the application's guardian, which a sentry shouldn't share nonces with
 * @throws InvalidPrtConfigError when the pool runs out, a key file is unusable, or a sentry
 * the CLI runs is an account the node signs with
 */
export const resolveSentries = (
    prt: PrtOptions,
    options: { guardian?: Address } = {},
): ResolvedPrt => {
    const warnings: string[] = [];
    const named = new Set(
        prt.sentries.flatMap(({ address }) =>
            address === undefined ? [] : [address.toLowerCase()],
        ),
    );
    let next = SENTRY_POOL_START;

    const sentries = prt.sentries.map((sentry, index): ResolvedSentry => {
        const entry = index + 1;
        const label = sentryLabel(sentry, index);
        if (sentry.label !== undefined && sentry.type === undefined) {
            warnings.push(
                `${sentryEntry(index)} has a label but no type, so the CLI runs nothing for it and the label names nothing`,
            );
        }
        if (sentry.privateKeyFile !== undefined) {
            const { address, source } = resolveKeyFile(sentry, index);
            return { entry, label, address, type: sentry.type, source };
        }
        if (sentry.address !== undefined) {
            const source = sourceOf(sentry.address);
            if (sentry.type !== undefined && source.kind === "external") {
                throw new InvalidPrtConfigError(
                    `the CLI has no key for ${sentry.address}: set private_key_file to run the sentry with it, or drop the type to appoint it only`,
                    sentryEntry(index),
                );
            }
            return {
                entry,
                label,
                address: sentry.address,
                type: sentry.type,
                source,
                ...(sentry.type !== undefined &&
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
                `needs an address: the sentry pool, devnet accounts ${SENTRY_POOL_START} to ${SENTRY_POOL_START + SENTRY_POOL_SIZE - 1}, is used up`,
                sentryEntry(index),
            );
        }
        const poolIndex = next++;
        const { address, privateKey } = getDevnetAccount(poolIndex);
        return {
            entry,
            label,
            address,
            type: sentry.type,
            source: { kind: "pool", index: poolIndex },
            privateKey,
        };
    });

    // a key file's address is known only now
    sentries.forEach((sentry, index) => {
        const same = sentries.findIndex(
            (other, i) =>
                i < index && isAddressEqual(other.address, sentry.address),
        );
        if (same >= 0) {
            throw new InvalidPrtConfigError(
                `address ${sentry.address} is also the address of ${sentryEntry(same)}`,
                sentryEntry(index),
            );
        }
    });

    // a sentry the CLI runs sends its own transactions, so it can't be an account the node
    // sends from; sharing one with the guardian or the default sender only risks a collision
    for (const sentry of sentries) {
        if (sentry.type === undefined || sentry.source.kind === "pool") {
            continue;
        }
        const where = sentryEntry(sentry.entry - 1);
        if (sentry.source.kind === "devnet") {
            if (sentry.source.index === NODE_CLAIMER_INDEX) {
                throw new InvalidPrtConfigError(
                    `devnet account ${NODE_CLAIMER_INDEX} signs the node's claims, so it can't also run a sentry`,
                    where,
                );
            }
            if (sentry.source.index === NODE_PRT_INDEX) {
                throw new InvalidPrtConfigError(
                    `devnet account ${NODE_PRT_INDEX} signs the node's PRT transactions, so it can't also run a sentry`,
                    where,
                );
            }
            if (sentry.source.index === DEFAULT_SENDER_INDEX) {
                warnings.push(
                    `${where} is devnet account ${DEFAULT_SENDER_INDEX}, the default sender of cartesi send and deposit; their transactions may collide`,
                );
            }
        }
        if (
            options.guardian !== undefined &&
            isAddressEqual(sentry.address, options.guardian)
        ) {
            warnings.push(
                `${where} is the guardian of the application; its transactions may collide with an emergency withdrawal`,
            );
        }
    }

    if (prt.sentryManager !== undefined && sentries.length === 0) {
        warnings.push(
            "[prt].sentry_manager is set but there are no [[prt.sentries]]; the manager has no sentries to rotate",
        );
    }

    return { sentryManager: prt.sentryManager, sentries, warnings };
};

/** The sentries the CLI runs a node for. */
export const runnableSentries = (prt: ResolvedPrt): ResolvedSentry[] =>
    prt.sentries.filter(({ type }) => type !== undefined);

/**
 * The chain calls `checkSentries` makes, so it can run against a fake client in tests.
 */
export type SentryClient = {
    getBalance: (args: { address: Address }) => Promise<bigint>;
    setBalance: (args: { address: Address; value: bigint }) => Promise<void>;
};

/**
 * Funds the pool sentries and checks that the other sentries the CLI runs have ETH to send
 * their claims with. Runs once anvil is healthy, before the deploy, and again before a
 * redeploy: the balance is set, not added to, so repeating it changes nothing.
 * @throws when a sentry of the developer's own has no ETH, which the CLI never gives it
 */
export const checkSentries = async (
    client: SentryClient,
    prt: ResolvedPrt,
): Promise<void> => {
    for (const sentry of runnableSentries(prt)) {
        if (sentry.source.kind === "pool") {
            await client.setBalance({
                address: sentry.address,
                value: SENTRY_FUNDING,
            });
            continue;
        }
        const balance = await client.getBalance({ address: sentry.address });
        if (balance === 0n) {
            throw new Error(
                `sentry ${sentry.label} ${sentry.address} has no ETH on this devnet; fund it before cartesi run, e.g. with cast rpc anvil_setBalance`,
            );
        }
    }
};

/**
 * One line per sentry, with its full address so it can be copied into other tools.
 */
export const describeSentry = (sentry: ResolvedSentry): string => {
    const { source } = sentry;
    const origin =
        source.kind === "pool"
            ? `devnet account ${source.index}, funded by the CLI`
            : source.kind === "devnet"
              ? `devnet account ${source.index}`
              : source.kind === "key-file"
                ? `key in ${source.path}`
                : "appointed only";
    return `sentry ${chalk.cyan(sentry.label)} ${sentry.address} ${chalk.dim(`(${origin})`)}`;
};
