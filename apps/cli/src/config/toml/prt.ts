import type { TomlValue } from "smol-toml";
import { isAddressEqual, zeroAddress } from "viem";
import {
    formatValue,
    InvalidPrtConfigError,
    InvalidTableError,
} from "../errors.js";
import type { PrtNode, PrtNodeType, PrtOptions } from "../types.js";
import { assertKnownKeys, isTomlTable } from "./tables.js";
import {
    parseBoolean,
    parseRequiredAddress,
    parseRequiredString,
} from "./values.js";

export const PRT_KEYS: readonly string[] = ["nodes", "sentry_manager"];

export const PRT_NODE_KEYS: readonly string[] = [
    "address",
    "claim",
    "private_key_file",
    "sentry",
    "type",
];

export const PRT_NODE_TYPES: readonly PrtNodeType[] = ["reference", "sling"];

/**
 * A label is the key of an entry and names its container, so it keeps to what a service name
 * can hold. It starts with a letter: entries count in file order, and a parsed table puts
 * integer-like keys first.
 */
const LABEL_PATTERN = /^[a-z][a-z0-9_-]*$/;

/** The table of an entry, as errors name it. */
export const prtNodeTable = (label: string) => `[prt.nodes.${label}]`;

const parseChoice = <T extends string>(
    value: TomlValue,
    key: string,
    choices: readonly T[],
    where: string,
): T => {
    if (typeof value === "string" && choices.includes(value as T)) {
        return value as T;
    }
    throw new InvalidPrtConfigError(
        `${key} ${formatValue(value)} isn't supported, expected one of: ${choices.join(", ")}`,
        where,
    );
};

const parseNode = (label: string, value: TomlValue): PrtNode => {
    const where = prtNodeTable(label);
    if (!LABEL_PATTERN.test(label)) {
        throw new InvalidPrtConfigError(
            `label "${label}" must start with a lowercase letter, then lowercase letters, digits, - or _`,
            where,
        );
    }
    if (!isTomlTable(value)) {
        throw new InvalidTableError(where, value);
    }
    assertKnownKeys(value, PRT_NODE_KEYS, `in ${where}`);

    const type =
        value.type === undefined
            ? undefined
            : parseChoice(value.type, "type", PRT_NODE_TYPES, where);
    const sentry = parseBoolean(value.sentry, false);
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
    const privateKeyFile =
        value.private_key_file === undefined
            ? undefined
            : parseRequiredString(value.private_key_file, "private_key_file");

    // the rollups-node's own entry: the CLI runs it on the devnet accounts, and it never
    // claims as a sentry, so the only setting is whether it submits claims at all
    if (type === "reference") {
        if (sentry) {
            throw new InvalidPrtConfigError(
                "the reference node can't be a sentry yet",
                where,
            );
        }
        if (address !== undefined || privateKeyFile !== undefined) {
            throw new InvalidPrtConfigError(
                "the reference node takes no address or private_key_file: the CLI runs it on the devnet accounts",
                where,
            );
        }
        return { type, sentry, claim: parseBoolean(value.claim, true) };
    }
    if (value.claim !== undefined) {
        throw new InvalidPrtConfigError(
            type === "sling"
                ? "claim isn't supported on a sling node yet: it always claims"
                : 'claim needs type = "reference": only the rollups-node can read instead of claiming',
            where,
        );
    }
    if (type === undefined) {
        if (address === undefined) {
            throw new InvalidPrtConfigError(
                "set a type for the CLI to run the node, or an address to appoint one run elsewhere",
                where,
            );
        }
        if (privateKeyFile !== undefined) {
            throw new InvalidPrtConfigError(
                "private_key_file needs a type: the CLI only reads the key of a node it runs",
                where,
            );
        }
        // without a type the CLI runs nothing, so appointing is all the entry can do
        if (!sentry) {
            throw new InvalidPrtConfigError(
                "an entry without a type is appointed only, so it needs sentry = true",
                where,
            );
        }
    }
    if (privateKeyFile === "") {
        throw new InvalidPrtConfigError(
            "private_key_file must name a file",
            where,
        );
    }

    return {
        ...(type !== undefined && { type }),
        sentry,
        ...(address !== undefined && { address }),
        ...(privateKeyFile !== undefined && { privateKeyFile }),
    };
};

/**
 * Parses the [prt.nodes.<label>] entries, in file order. The label is the key, so it is unique
 * by construction. Addresses are checked against each other since the node rejects a
 * duplicate, and the rollups-node is one entry.
 */
const parseNodes = (value: TomlValue): Record<string, PrtNode> => {
    if (value === undefined) {
        return {};
    }
    if (!isTomlTable(value)) {
        throw new InvalidTableError("[prt.nodes]", value);
    }
    const nodes: Record<string, PrtNode> = {};
    for (const [label, entry] of Object.entries(value)) {
        const node = parseNode(label, entry);
        const reference = Object.entries(nodes).find(
            ([, other]) => other.type === "reference",
        );
        if (node.type === "reference" && reference !== undefined) {
            throw new InvalidPrtConfigError(
                `only one entry is the reference node, and ${prtNodeTable(reference[0])} already is`,
                prtNodeTable(label),
            );
        }
        const same = Object.entries(nodes).find(
            ([, other]) =>
                other.address !== undefined &&
                node.address !== undefined &&
                isAddressEqual(other.address, node.address),
        );
        if (same !== undefined) {
            throw new InvalidPrtConfigError(
                `address ${node.address} is also the address of ${prtNodeTable(same[0])}`,
                prtNodeTable(label),
            );
        }
        nodes[label] = node;
    }
    return nodes;
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
        nodes: parseNodes(prt.nodes),
    };
};
