import chalk from "chalk";
import type { Address } from "viem";
import { DEVNET_MNEMONIC } from "./compose/node.js";
import {
    InvalidPrtConfigError,
    type PrtOptions,
    type SentryType,
} from "./config.js";
import { sentryEntry, sentryLabel } from "./config/toml/prt.js";
import {
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

/** Where a sentry's address came from. */
export type SentrySource =
    | { kind: "pool"; index: number } // a devnet account of the sentry pool
    | { kind: "devnet"; index: number } // another devnet account, named in the entry
    | { kind: "external" }; // an address of the developer's own

export type ResolvedSentry = {
    entry: number; // 1-based position, the sentry's ID on the consensus
    label: string;
    address: Address;
    type?: SentryType;
    source: SentrySource;
};

export type ResolvedPrt = {
    sentryManager?: Address;
    sentries: ResolvedSentry[];
    warnings: string[];
};

const isPoolIndex = (index: number) =>
    index >= SENTRY_POOL_START && index < SENTRY_POOL_START + SENTRY_POOL_SIZE;

const sourceOf = (address: Address): SentrySource => {
    const index = findMnemonicAccountIndex({
        address,
        max: DEVNET_ACCOUNTS,
        mnemonic: DEVNET_MNEMONIC,
    });
    if (index === undefined) {
        return { kind: "external" };
    }
    return { kind: isPoolIndex(index) ? "pool" : "devnet", index };
};

/**
 * Gives every [[prt.sentries]] entry its address: the one it names, or else the next free
 * account of the sentry pool, in entry order. Pool accounts named by an entry are skipped, so
 * no two sentries share an address. Needs no chain, so it runs before anything starts.
 * @throws InvalidPrtConfigError when the pool runs out
 */
export const resolveSentries = (prt: PrtOptions): ResolvedPrt => {
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
        if (sentry.address !== undefined) {
            return {
                entry,
                label,
                address: sentry.address,
                type: sentry.type,
                source: sourceOf(sentry.address),
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
        return {
            entry,
            label,
            address: getDevnetAccount(poolIndex).address,
            type: sentry.type,
            source: { kind: "pool", index: poolIndex },
        };
    });

    if (prt.sentryManager !== undefined && sentries.length === 0) {
        warnings.push(
            "[prt].sentry_manager is set but there are no [[prt.sentries]]; the manager has no sentries to rotate",
        );
    }

    return { sentryManager: prt.sentryManager, sentries, warnings };
};

/**
 * The lines printed before a deploy with sentries: the manager, then one line per sentry
 * with its full address so it can be copied into other tools. Nothing without sentries,
 * where the manager has nothing to rotate.
 */
export const describePrt = (prt: ResolvedPrt): string[] =>
    prt.sentries.length === 0
        ? []
        : [
              prt.sentryManager === undefined
                  ? `sentry manager ${chalk.dim("none (the sentries can't be rotated)")}`
                  : `sentry manager ${prt.sentryManager}`,
              ...prt.sentries.map(describeSentry),
          ];

/**
 * One line per sentry, with its full address so it can be copied into other tools.
 */
export const describeSentry = (sentry: ResolvedSentry): string => {
    const { source } = sentry;
    const origin =
        source.kind === "external"
            ? sentry.type === undefined
                ? "appointed only"
                : "your account"
            : `devnet account ${source.index}`;
    return `sentry ${chalk.cyan(sentry.label)} ${sentry.address} ${chalk.dim(`(${origin})`)}`;
};
