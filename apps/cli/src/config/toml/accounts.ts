import type { TomlPrimitive } from "smol-toml";
import { LOG2_LEAF_SIZE, log2OfPowerOfTwo } from "../accounts.js";
import {
    InvalidTableError,
    InvalidWithdrawalConfigError,
    formatValue,
} from "../errors.js";
import type { AccountsDriveMarker, WithdrawalOptions } from "../types.js";
import { assertKnownKeys, isTomlTable, type TomlTable } from "./tables.js";
import {
    parseOptionalBoolean,
    parseRequiredAddress,
    parseSize,
} from "./values.js";

export const ACCOUNTS_DRIVE_KEYS: readonly string[] = [
    "accounts_drive",
    "accounts_drive_size",
];

/**
 * Parses the keys that mark a drive or nvram as the accounts drive, leaving them out when unset.
 */
export const parseAccountsDriveMarker = (
    toml: TomlTable,
): AccountsDriveMarker => {
    const accountsDrive = parseOptionalBoolean(toml.accounts_drive);
    const accountsDriveSize = parseSize(toml.accounts_drive_size);
    return {
        ...(accountsDrive !== undefined && { accountsDrive }),
        ...(accountsDriveSize !== undefined && { accountsDriveSize }),
    };
};

const parseAccountSize = (value: TomlPrimitive): number => {
    const size = parseSize(value);
    if (
        size === undefined ||
        size < 2 ** LOG2_LEAF_SIZE ||
        log2OfPowerOfTwo(size) === undefined
    ) {
        throw new InvalidWithdrawalConfigError(
            `account_size ${formatValue(value)} must be a power of two of at least 32 bytes, such as 32 or 64`,
        );
    }
    return size;
};

const WITHDRAWAL_KEYS: readonly string[] = [
    "account_size",
    "guardian",
    "withdrawal_output_builder",
];

/**
 * Parses [withdrawal], which only applies to an application with an accounts drive. Like the
 * other tables, it reads the keys it uses and rejects any other.
 */
export const parseOptionalWithdrawal = (
    withdrawal: TomlPrimitive,
): WithdrawalOptions | undefined => {
    if (withdrawal === undefined) {
        return undefined;
    }
    if (!isTomlTable(withdrawal)) {
        throw new InvalidTableError("[withdrawal]", withdrawal);
    }
    assertKnownKeys(withdrawal, WITHDRAWAL_KEYS, "in [withdrawal]");

    const optional = <T>(
        key: string,
        parser: (value: TomlPrimitive, key: string) => T,
    ): T | undefined =>
        withdrawal[key] === undefined
            ? undefined
            : parser(withdrawal[key], key);

    const options: WithdrawalOptions = {
        guardian: optional("guardian", parseRequiredAddress),
        withdrawal_output_builder: optional(
            "withdrawal_output_builder",
            parseRequiredAddress,
        ),
        account_size: optional("account_size", parseAccountSize),
    };
    return options;
};
