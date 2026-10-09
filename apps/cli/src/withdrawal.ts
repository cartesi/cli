import fs from "node:fs";
import path from "node:path";
import type { Address } from "viem";
import {
    type AccountsDrive,
    assertAccountsDriveLength,
    type Config,
    getAccountsDrive,
    getAccountsDriveConfig,
    InvalidAccountsDriveError,
    InvalidWithdrawalConfigError,
    LOG2_LEAF_SIZE,
    type WithdrawalConfig,
} from "./config.js";
import { testUsdWithdrawalOutputBuilderAddress } from "./contracts.js";

/**
 * First account of the devnet mnemonic, which the node signs with, so foreclosing on the devnet
 * needs no signer setup.
 */
export const DEVNET_GUARDIAN: Address =
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

export const DEVNET_WITHDRAWAL_OUTPUT_BUILDER: Address =
    testUsdWithdrawalOutputBuilderAddress;

/**
 * Memory range of a drive, as resolved by cartesi-machine when storing a snapshot.
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
export type AccountsDriveLayout = AccountsDrive & {
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

    const start = BigInt(ranges[index].start);
    const driveLength = BigInt(ranges[index].length);
    const { accountsDriveSize } = getAccountsDriveConfig(config, accountsDrive);
    const region = assertAccountsDriveLength(label, {
        accountsDriveSize:
            accountsDriveSize === undefined
                ? undefined
                : BigInt(accountsDriveSize),
        driveLength,
        log2LeavesPerAccount: config.withdrawal?.log2LeavesPerAccount ?? 0,
    });
    if (!region) {
        throw new InvalidAccountsDriveError(label, "unknown size");
    }
    const { length, log2Length } = region;

    if (start % length !== 0n) {
        throw new InvalidAccountsDriveError(
            label,
            `start 0x${start.toString(16)} is not aligned to its size 0x${length.toString(16)}, so its start index is not an integer`,
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
 * Derives the configuration passed to the node from the accounts drive layout, applying the
 * overrides of [withdrawal] and devnet defaults.
 * @param options.fork whether the node runs against a fork, where devnet contracts don't exist
 */
export const resolveWithdrawalConfig = (
    config: Config,
    layout: AccountsDriveLayout,
    options?: { fork?: boolean },
): WithdrawalConfig => {
    const withdrawal = config.withdrawal ?? {};
    const log2LeavesPerAccount = withdrawal.log2LeavesPerAccount ?? 0;
    const log2MaxNumOfAccounts =
        layout.log2Length - log2LeavesPerAccount - LOG2_LEAF_SIZE;
    const accountsDriveStartIndex = Number(layout.startIndex);

    if (options?.fork && !withdrawal.withdrawalOutputBuilder) {
        throw new InvalidWithdrawalConfigError(
            "the devnet withdrawal output builder doesn't exist on a fork, set withdrawal_output_builder under [withdrawal]",
        );
    }

    return {
        guardian: withdrawal.guardian ?? DEVNET_GUARDIAN,
        log2_leaves_per_account: log2LeavesPerAccount,
        log2_max_num_of_accounts: log2MaxNumOfAccounts,
        accounts_drive_start_index: accountsDriveStartIndex,
        withdrawal_output_builder:
            withdrawal.withdrawalOutputBuilder ??
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
    const stored = readStoredMachineConfig(imagePath);
    const layout = resolveAccountsDriveLayout(config, stored);
    return layout && resolveWithdrawalConfig(config, layout, options);
};
