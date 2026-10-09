import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import { type Address, isAddressEqual } from "viem";
import {
    type AccountsDrive,
    assertAccountsDriveLength,
    type Config,
    getAccountsDrive,
    getLog2LeavesPerAccount,
    InvalidAccountsDriveError,
    InvalidWithdrawalConfigError,
    LOG2_LEAF_SIZE,
    splitSize,
    type WithdrawalConfig,
} from "./config.js";
import { testUsdWithdrawalOutputBuilderAddress } from "./contracts.js";
import { stringifyWithdrawalConfig } from "./exec/rollups.js";

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
    const log2LeavesPerAccount = getLog2LeavesPerAccount(settings);
    const accountSize = 1n << BigInt(LOG2_LEAF_SIZE + log2LeavesPerAccount);
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
            `log2_max_num_of_accounts is ${settings.log2_max_num_of_accounts}, but the accounts drive '${layout.label}' of ${layout.length} bytes holds 2^${log2MaxNumOfAccounts} accounts of ${accountSize} bytes. Remove it to use the derived value, or change the size of the drive`,
        );
    }

    const withdrawalOutputBuilder =
        settings.withdrawal_output_builder ?? DEVNET_WITHDRAWAL_OUTPUT_BUILDER;
    if (
        isAddressEqual(
            withdrawalOutputBuilder,
            DEVNET_WITHDRAWAL_OUTPUT_BUILDER,
        ) &&
        accountSize !== 32n
    ) {
        throw new InvalidWithdrawalConfigError(
            `the devnet withdrawal output builder expects accounts of 32 bytes, but they are set to ${accountSize} bytes. Remove account_size, or set withdrawal_output_builder to a builder for ${accountSize}-byte accounts`,
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
        withdrawal_output_builder: withdrawalOutputBuilder,
    };
};

// a size as people read it, e.g. "4 MiB"
const formatBytes = (length: bigint): string => {
    const { value, unit } = splitSize(length);
    return unit ? `${value} ${unit}B` : `${value} bytes`;
};

const formatRows = (rows: [string, string, string?][], indent = "") => {
    const keyWidth = Math.max(...rows.map(([key]) => key.length));
    const valueWidth = Math.max(...rows.map(([, value]) => value.length));
    return rows.map(([key, value, note]) =>
        `${indent}${key.padEnd(keyWidth)}  ${note ? `${value.padEnd(valueWidth)}  ${chalk.dim(note)}` : value}`.trimEnd(),
    );
};

/**
 * Describes the accounts drive layout and the withdrawal configuration derived from it, to
 * show the developer what the guest sees and what will be deployed.
 */
export const describeWithdrawalConfig = (
    config: Config,
    layout: AccountsDriveLayout,
    withdrawal: WithdrawalConfig,
): string => {
    const settings = config.withdrawalConfig ?? {};
    const accountSize =
        1n << BigInt(LOG2_LEAF_SIZE + withdrawal.log2_leaves_per_account);
    const accounts = 1n << BigInt(withdrawal.log2_max_num_of_accounts);
    const derived = (key: keyof WithdrawalConfig) =>
        settings[key] === undefined
            ? "derived"
            : "derived, matches cartesi.toml";
    const address = (
        key: "guardian" | "withdrawal_output_builder",
        devnet: Address,
        name: string,
    ): [string, string, string?] => [
        key,
        withdrawal[key],
        settings[key] === undefined && withdrawal[key] === devnet
            ? `devnet ${name}`
            : undefined,
    ];
    const devnetDefaults =
        settings.guardian === undefined ||
        settings.withdrawal_output_builder === undefined;

    const lines = [
        ...formatRows([
            [
                "accounts drive",
                `${chalk.cyan(layout.label)} (${layout.kind === "nvram" ? "nvram" : "flash drive"}) → ${chalk.cyan(layout.device)}`,
            ],
            ["start", hex(layout.start)],
            [
                "size",
                `${formatBytes(layout.length)} (2^${layout.log2Length} bytes)${layout.length === layout.driveLength ? "" : `, at the beginning of ${formatBytes(layout.driveLength)}`}`,
            ],
            ["accounts", `${accounts} × ${accountSize} bytes`],
        ]),
        "",
        "[withdrawal.config]",
        ...formatRows(
            [
                address("guardian", DEVNET_GUARDIAN, "account 1"),
                address(
                    "withdrawal_output_builder",
                    DEVNET_WITHDRAWAL_OUTPUT_BUILDER,
                    "TestUsdWithdrawalOutputBuilder",
                ),
                [
                    "account_size",
                    `${accountSize} bytes`,
                    settings.account_size === undefined &&
                    settings.log2_leaves_per_account === undefined
                        ? "default"
                        : undefined,
                ],
                [
                    "log2_leaves_per_account",
                    withdrawal.log2_leaves_per_account.toString(),
                    settings.log2_leaves_per_account === undefined
                        ? "derived"
                        : undefined,
                ],
                [
                    "log2_max_num_of_accounts",
                    withdrawal.log2_max_num_of_accounts.toString(),
                    derived("log2_max_num_of_accounts"),
                ],
                [
                    "accounts_drive_start_index",
                    `${withdrawal.accounts_drive_start_index} (${hex(withdrawal.accounts_drive_start_index)})`,
                    derived("accounts_drive_start_index"),
                ],
            ],
            "  ",
        ),
        "",
        `--withdrawal-config '${stringifyWithdrawalConfig(withdrawal)}'`,
    ];
    if (devnetDefaults) {
        lines.push(
            chalk.yellow(
                "devnet defaults in use: set guardian and withdrawal_output_builder in [withdrawal.config] to deploy elsewhere",
            ),
        );
    }
    return lines.join("\n");
};

/**
 * Locates the accounts drive in the built machine, and derives from it the emergency withdrawal
 * configuration of the application.
 * @returns undefined if emergency withdrawal is not enabled
 */
export const resolveWithdrawal = (
    config: Config,
    imagePath: string,
    options?: { fork?: boolean },
):
    | { layout: AccountsDriveLayout; withdrawal: WithdrawalConfig }
    | undefined => {
    if (!getAccountsDrive(config)) {
        return undefined;
    }
    const layout = resolveAccountsDriveLayout(
        config,
        readStoredMachineConfig(imagePath),
    );
    return (
        layout && {
            layout,
            withdrawal: resolveWithdrawalConfig(config, layout, options),
        }
    );
};

/**
 * Derives the emergency withdrawal configuration of the application from its built machine.
 * @returns undefined if emergency withdrawal is not enabled
 */
export const getWithdrawalConfig = (
    config: Config,
    imagePath: string,
    options?: { fork?: boolean },
): WithdrawalConfig | undefined =>
    resolveWithdrawal(config, imagePath, options)?.withdrawal;
