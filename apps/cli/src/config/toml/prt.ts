import type { TomlValue } from "smol-toml";
import { isAddressEqual, zeroAddress } from "viem";
import {
    formatValue,
    InvalidPrtConfigError,
    InvalidTableError,
} from "../errors.js";
import type {
    PrtNode,
    PrtNodeRole,
    PrtNodeType,
    PrtOptions,
} from "../types.js";
import { assertKnownKeys, isTomlTable } from "./tables.js";
import { parseRequiredAddress, parseRequiredString } from "./values.js";

export const PRT_KEYS: readonly string[] = ["nodes", "sentry_manager"];

export const PRT_NODE_KEYS: readonly string[] = [
    "address",
    "private_key_file",
    "role",
    "type",
];

export const PRT_NODE_TYPES: readonly PrtNodeType[] = ["sling"];

export const PRT_NODE_ROLES: readonly PrtNodeRole[] = ["claimer", "sentry"];

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

    // the roles differ in funding, reserved accounts and the node's mode, so
    // every entry says which one it is
    if (value.role === undefined) {
        throw new InvalidPrtConfigError(
            `role is required, one of: ${PRT_NODE_ROLES.join(", ")}`,
            where,
        );
    }
    const role = parseChoice(value.role, "role", PRT_NODE_ROLES, where);
    const type =
        value.type === undefined
            ? undefined
            : parseChoice(value.type, "type", PRT_NODE_TYPES, where);
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

    // the CLI runs the claimer, and the rollups-node only reads
    if (role === "claimer" && type === undefined) {
        throw new InvalidPrtConfigError(
            "a claimer needs a type: the CLI runs it, and the rollups-node would read with no claimer",
            where,
        );
    }
    if (type === undefined && address === undefined) {
        throw new InvalidPrtConfigError(
            "set a type for the CLI to run the sentry, or an address to appoint one run elsewhere",
            where,
        );
    }
    if (privateKeyFile !== undefined && type === undefined) {
        throw new InvalidPrtConfigError(
            "private_key_file needs a type: the CLI only reads the key of a node it runs",
            where,
        );
    }
    if (privateKeyFile === "") {
        throw new InvalidPrtConfigError(
            "private_key_file must name a file",
            where,
        );
    }

    return {
        role,
        ...(type !== undefined && { type }),
        ...(address !== undefined && { address }),
        ...(privateKeyFile !== undefined && { privateKeyFile }),
    };
};

/**
 * Parses the [prt.nodes.<label>] entries, in file order. The label is the key, so it is unique
 * by construction. Addresses are checked against each other since the node rejects a
 * duplicate, and one participant claims.
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
        const claimer = Object.entries(nodes).find(
            ([, other]) => other.role === "claimer",
        );
        if (node.role === "claimer" && claimer !== undefined) {
            throw new InvalidPrtConfigError(
                `only one entry claims, and ${prtNodeTable(claimer[0])} already does`,
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
