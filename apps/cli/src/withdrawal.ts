import fs from "node:fs";
import path from "node:path";
import type { Address } from "viem";
import {
    type AccountsDrive,
    assertAccountsDriveLength,
    type Config,
    getAccountsDrive,
    InvalidAccountsDriveError,
    InvalidWithdrawalConfigError,
    LOG2_LEAF_SIZE,
    type WithdrawalConfig,
} from "./config.js";
import { testUsdWithdrawalOutputBuilderAddress } from "./contracts.js";

/**
 * Second account of the devnet mnemonic. The node signs with the first one, so the guardian
 * doesn't compete with it for nonces, and `cartesi foreclose` still finds it in the mnemonic.
 */
export const DEVNET_GUARDIAN: Address =
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

export const DEVNET_WITHDRAWAL_OUTPUT_BUILDER: Address =
    testUsdWithdrawalOutputBuilderAddress;

/**
 * Memory range of a drive or nvram, as placed by cartesi-machine when storing a snapshot.
 */
type StoredRange = {
    label?: string;
    length: number;
    start: number;
};

/**
 * Subset of the `config.json` of a stored machine snapshot.
 */
export type StoredMachineConfig = {
    config: {
        flash_drive?: StoredRange[];
        nvram?: StoredRange[];
    };
};

/**
 * Placement of the accounts drive in the built machine. The accounts drive starts at the
 * beginning of the drive or nvram that holds it, and may be shorter than it.
 */
export type AccountsDriveLayout = Pick<AccountsDrive, "kind" | "label"> & {
    device: string; // path the guest opens the drive at
    driveLength: bigint; // length of the drive or nvram holding the accounts drive
    length: bigint; // length of the accounts drive
    log2Length: number;
    start: bigint;
    startIndex: bigint; // start in units of length
};

export const readStoredMachineConfig = (
    imagePath: string,
): StoredMachineConfig => {
    const filename = path.join(imagePath, "config.json");
    if (!fs.existsSync(filename)) {
        throw new Error(
            `Machine configuration ${filename} not found, run 'cartesi build'`,
        );
    }
    return JSON.parse(fs.readFileSync(filename, "utf-8"));
};

const hex = (value: bigint | number) => `0x${value.toString(16)}`;

/**
 * Locates the accounts drive in the built machine. Its placement is decided by cartesi-machine,
 * so it is read from the stored configuration instead of reimplementing the placement rules.
 * @returns undefined if no drive is marked as the accounts drive
 */
export const resolveAccountsDriveLayout = (
    config: Config,
    stored: StoredMachineConfig,
): AccountsDriveLayout | undefined => {
    const accountsDrive = getAccountsDrive(config);
    if (!accountsDrive) {
        return undefined;
    }

    const { kind, label } = accountsDrive;
    const ranges = stored.config[kind] ?? [];

    // the guest numbers the devices in the order of the stored configuration
    const index = ranges.findIndex((range) => range.label === label);
    if (index < 0) {
        throw new InvalidAccountsDriveError(
            label,
            "not found in the built machine, run 'cartesi build'",
        );
    }

    // JSON numbers lose precision beyond 2^53, which no emulator places drives at today
    const range = ranges[index];
    if (
        !Number.isSafeInteger(range.start) ||
        !Number.isSafeInteger(range.length)
    ) {
        throw new InvalidAccountsDriveError(
            label,
            `its start ${range.start} or length ${range.length} in the built machine can't be read without losing precision`,
        );
    }
    const start = BigInt(range.start);
    const driveLength = BigInt(range.length);

    const region = assertAccountsDriveLength(
        config,
        accountsDrive,
        driveLength,
    );
    if (!region) {
        throw new InvalidAccountsDriveError(label, "unknown size");
    }
    const { length, log2Length } = region;

    if (start % length !== 0n) {
        throw new InvalidAccountsDriveError(
            label,
            `start ${hex(start)} is not aligned to its size ${hex(length)}, so its start index is not an integer`,
        );
    }

    return {
        kind,
        label,
        device: kind === "nvram" ? `/dev/uio${index}` : `/dev/pmem${index}`,
        driveLength,
        length,
        log2Length,
        start,
        startIndex: start / length,
    };
};

/**
 * Derives the configuration passed to the node from the accounts drive layout. Layout keys of
 * [withdrawal.config] must match the derived values, and its addresses default to devnet ones.
 * @param options.fork whether the node runs against a fork, where the devnet defaults don't apply
 */
export const resolveWithdrawalConfig = (
    config: Config,
    layout: AccountsDriveLayout,
    options?: { fork?: boolean },
): WithdrawalConfig => {
    const settings = config.withdrawalConfig ?? {};
    const log2LeavesPerAccount = settings.log2_leaves_per_account ?? 0;
    const log2MaxNumOfAccounts =
        layout.log2Length - log2LeavesPerAccount - LOG2_LEAF_SIZE;
    const accountsDriveStartIndex = layout.startIndex;

    if (
        settings.accounts_drive_start_index !== undefined &&
        settings.accounts_drive_start_index !== accountsDriveStartIndex
    ) {
        throw new InvalidWithdrawalConfigError(
            `accounts_drive_start_index is ${settings.accounts_drive_start_index} (${hex(settings.accounts_drive_start_index)}), but the built machine places the accounts drive '${layout.label}' at index ${accountsDriveStartIndex} (${hex(accountsDriveStartIndex)}). Remove it to use the derived value, or check what moved the drive: a drive declared before it was added or resized, the root drive grew, ram_length changed, or the emulator version changed`,
        );
    }
    if (
        settings.log2_max_num_of_accounts !== undefined &&
        settings.log2_max_num_of_accounts !== log2MaxNumOfAccounts
    ) {
        throw new InvalidWithdrawalConfigError(
            `log2_max_num_of_accounts is ${settings.log2_max_num_of_accounts}, but the accounts drive '${layout.label}' of ${layout.length} bytes holds 2^${log2MaxNumOfAccounts} accounts of ${1n << BigInt(LOG2_LEAF_SIZE + log2LeavesPerAccount)} bytes. Remove it to use the derived value, or change the size of the drive`,
        );
    }

    if (options?.fork) {
        const missing = [
            settings.guardian === undefined && "guardian",
            settings.withdrawal_output_builder === undefined &&
                "withdrawal_output_builder",
        ].filter(Boolean);
        if (missing.length > 0) {
            throw new InvalidWithdrawalConfigError(
                `the devnet defaults don't apply to a fork, set ${missing.join(" and ")}`,
            );
        }
    }

    return {
        guardian: settings.guardian ?? DEVNET_GUARDIAN,
        log2_leaves_per_account: log2LeavesPerAccount,
        log2_max_num_of_accounts: log2MaxNumOfAccounts,
        accounts_drive_start_index: accountsDriveStartIndex,
        withdrawal_output_builder:
            settings.withdrawal_output_builder ??
            DEVNET_WITHDRAWAL_OUTPUT_BUILDER,
    };
};

/**
 * Derives the emergency withdrawal configuration of the application from its built machine.
 * @returns undefined if emergency withdrawal is not enabled
 */
export const getWithdrawalConfig = (
    config: Config,
    imagePath: string,
    options?: { fork?: boolean },
): WithdrawalConfig | undefined => {
    if (!getAccountsDrive(config)) {
        return undefined;
    }
    const layout = resolveAccountsDriveLayout(
        config,
        readStoredMachineConfig(imagePath),
    );
    return layout && resolveWithdrawalConfig(config, layout, options);
};
