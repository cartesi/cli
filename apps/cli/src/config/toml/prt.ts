import type { TomlValue } from "smol-toml";
import { isAddressEqual, zeroAddress } from "viem";
import {
    formatValue,
    InvalidPrtConfigError,
    InvalidTableError,
} from "../errors.js";
import type { PrtOptions, PrtSentry, SentryType } from "../types.js";
import { assertKnownKeys, isTomlTable } from "./tables.js";
import { parseRequiredAddress } from "./values.js";

export const PRT_KEYS: readonly string[] = ["sentries", "sentry_manager"];

export const PRT_SENTRY_KEYS: readonly string[] = ["address", "label", "type"];

export const SENTRY_TYPES: readonly SentryType[] = ["sling"];

/**
 * A label names a container, so it keeps to what a service name can hold.
 */
const LABEL_PATTERN = /^[a-z0-9_-]+$/;

/** Where an entry is, in the 1-based order the node appoints the sentries. */
export const sentryEntry = (index: number) => `prt.sentries[${index + 1}]`;

/**
 * The label of an entry: its own, or its 1-based position, which is also the sentry's ID on
 * the consensus.
 */
export const sentryLabel = (sentry: PrtSentry, index: number): string =>
    sentry.label ?? (index + 1).toString();

const parseSentryType = (value: TomlValue, where: string): SentryType => {
    if (
        typeof value === "string" &&
        SENTRY_TYPES.includes(value as SentryType)
    ) {
        return value as SentryType;
    }
    throw new InvalidPrtConfigError(
        `type ${formatValue(value)} isn't supported, expected one of: ${SENTRY_TYPES.join(", ")}`,
        where,
    );
};

const parseLabel = (value: TomlValue, where: string): string => {
    if (typeof value === "string" && LABEL_PATTERN.test(value)) {
        return value;
    }
    throw new InvalidPrtConfigError(
        `label ${formatValue(value)} must be lowercase letters, digits, - or _`,
        where,
    );
};

const parseSentry = (value: TomlValue, index: number): PrtSentry => {
    const where = sentryEntry(index);
    if (!isTomlTable(value)) {
        throw new InvalidTableError(where, value);
    }
    assertKnownKeys(value, PRT_SENTRY_KEYS, `in ${where}`);

    const address =
        value.address === undefined
            ? undefined
            : parseRequiredAddress(value.address, "address");
    if (address !== undefined && isAddressEqual(address, zeroAddress)) {
        throw new InvalidPrtConfigError(
            "address must not be the zero address",
            where,
        );
    }
    const type =
        value.type === undefined
            ? undefined
            : parseSentryType(value.type, where);
    const label =
        value.label === undefined ? undefined : parseLabel(value.label, where);

    if (type === undefined && address === undefined) {
        throw new InvalidPrtConfigError(
            "set a type for the CLI to run the sentry, or an address to appoint one run elsewhere",
            where,
        );
    }

    return {
        ...(address !== undefined && { address }),
        ...(type !== undefined && { type }),
        ...(label !== undefined && { label }),
    };
};

const parseSentries = (value: TomlValue): PrtSentry[] => {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new InvalidPrtConfigError(
            `sentries must be [[prt.sentries]] entries, got ${formatValue(value)}`,
        );
    }
    const sentries = value.map(parseSentry);

    // the node rejects a duplicate, and so does a container name
    sentries.forEach((sentry, index) => {
        const label = sentryLabel(sentry, index);
        const sameLabel = sentries.findIndex(
            (other, i) => i < index && sentryLabel(other, i) === label,
        );
        if (sameLabel >= 0) {
            throw new InvalidPrtConfigError(
                `label "${label}" is also the label of ${sentryEntry(sameLabel)}`,
                sentryEntry(index),
            );
        }
        if (sentry.address === undefined) {
            return;
        }
        const sameAddress = sentries.findIndex(
            (other, i) =>
                i < index &&
                other.address !== undefined &&
                isAddressEqual(other.address, sentry.address as `0x${string}`),
        );
        if (sameAddress >= 0) {
            throw new InvalidPrtConfigError(
                `address ${sentry.address} is also the address of ${sentryEntry(sameAddress)}`,
                sentryEntry(index),
            );
        }
    });

    return sentries;
};

/**
 * Parses [prt], which `cartesi run --prt` uses to deploy the application's consensus with
 * sentries. Like the other tables, it reads the keys it uses and rejects any other.
 */
export const parseOptionalPrt = (prt: TomlValue): PrtOptions | undefined => {
    if (prt === undefined) {
        return undefined;
    }
    if (!isTomlTable(prt)) {
        throw new InvalidTableError("[prt]", prt);
    }
    assertKnownKeys(prt, PRT_KEYS, "in [prt]");

    return {
        ...(prt.sentry_manager !== undefined && {
            sentryManager: parseRequiredAddress(
                prt.sentry_manager,
                "sentry_manager",
            ),
        }),
        sentries: parseSentries(prt.sentries),
    };
};
