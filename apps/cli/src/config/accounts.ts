import {
    InvalidAccountsDriveError,
    InvalidWithdrawalConfigError,
    MultipleAccountsDrivesError,
} from "./errors.js";
import { formatSize } from "./size.js";
import type {
    Config,
    DriveConfig,
    NvramConfig,
    WithdrawalOptions,
} from "./types.js";

export const LOG2_LEAF_SIZE = 5; // accounts are made of 32-byte leaves

/**
 * Number of 32-byte leaves of each account, in log2, from `account_size`. Defaults to one leaf.
 */
export const getLog2LeavesPerAccount = (options?: WithdrawalOptions): number =>
    options?.account_size !== undefined
        ? Math.log2(options.account_size) - LOG2_LEAF_SIZE // a power of two, so exact
        : 0;

/**
 * The drive or nvram marked with `accounts_drive = true`.
 */
export type AccountsDrive = {
    kind: "flash_drive" | "nvram"; // section of the stored machine config that holds it
    label: string;
    config: DriveConfig | NvramConfig; // its entry in cartesi.toml
};

/**
 * Every drive and nvram marked with `accounts_drive = true`. Parsing rejects more than one,
 * and lists them all to say which.
 */
const getMarkedDrives = (config: Config): AccountsDrive[] =>
    [
        ...Object.entries(config.drives).map(([label, drive]) => ({
            kind: "flash_drive" as const,
            label,
            config: drive,
        })),
        ...Object.entries(config.nvrams).map(([label, nvram]) => ({
            kind: "nvram" as const,
            label,
            config: nvram,
        })),
    ].filter((drive) => drive.config.accountsDrive);

export const getAccountsDrive = (config: Config): AccountsDrive | undefined =>
    getMarkedDrives(config)[0];

/**
 * The log2 of a positive power of two, or undefined for any other number. It reads the bits,
 * which is exact for every safe integer, where `&` wraps at 32 bits and Math.log2 rounds near
 * 2^53.
 */
export const log2OfPowerOfTwo = (value: number): number | undefined => {
    const bits = Number.isInteger(value) ? value.toString(2) : "";
    return /^10*$/.test(bits) ? bits.length - 1 : undefined;
};

const nextPowerOfTwo = (value: number): number =>
    2 ** (value - 1).toString(2).length;

/**
 * Checks the accounts drive can be divided into accounts. The accounts drive is either all of
 * the drive or nvram marked with `accounts_drive = true`, or its first `accounts_drive_size`
 * bytes, the rest being free for other application state.
 * @param driveLength length of the whole drive, if known
 * @returns the length of the accounts drive and its log2, if known
 */
export const assertAccountsDriveLength = (
    config: Config,
    accountsDrive: AccountsDrive,
    driveLength?: number,
): { length: number; log2Length: number } | undefined => {
    const { label } = accountsDrive;
    const { accountsDriveSize } = accountsDrive.config;
    const log2LeavesPerAccount = getLog2LeavesPerAccount(config.withdrawal);
    const length = accountsDriveSize ?? driveLength;
    if (length === undefined) {
        return undefined;
    }

    const log2Length = log2OfPowerOfTwo(length);
    if (log2Length === undefined) {
        const suggestion =
            length > 0 ? `, use "${formatSize(nextPowerOfTwo(length))}"` : "";
        throw new InvalidAccountsDriveError(
            label,
            accountsDriveSize !== undefined
                ? `accounts_drive_size ${length} is not a power of two${suggestion}`
                : `size ${length} is not a power of two${suggestion}, or set accounts_drive_size to keep the accounts at the beginning of a larger drive`,
        );
    }
    const log2AccountSize = LOG2_LEAF_SIZE + log2LeavesPerAccount;
    if (log2Length < log2AccountSize) {
        throw new InvalidAccountsDriveError(
            label,
            `size ${length} is smaller than one account of ${2 ** log2AccountSize} bytes`,
        );
    }
    if (
        accountsDriveSize !== undefined &&
        driveLength !== undefined &&
        accountsDriveSize > driveLength
    ) {
        throw new InvalidAccountsDriveError(
            label,
            `accounts_drive_size ${accountsDriveSize} is larger than the drive itself (${driveLength} bytes)`,
        );
    }
    return { length, log2Length };
};

/**
 * Checks what can be known about the accounts drive before the machine is built. Its placement
 * is only known after, see `resolveAccountsDriveLayout`.
 */
export const assertAccountsDrive = (config: Config) => {
    const marked = getMarkedDrives(config);
    if (marked.length > 1) {
        throw new MultipleAccountsDrivesError(marked.map(({ label }) => label));
    }

    for (const [label, drive] of [
        ...Object.entries(config.drives),
        ...Object.entries(config.nvrams),
    ]) {
        if (drive.accountsDriveSize !== undefined && !drive.accountsDrive) {
            throw new InvalidAccountsDriveError(
                label,
                "accounts_drive_size requires accounts_drive = true",
            );
        }
    }

    const [accountsDrive] = marked;
    if (!accountsDrive) {
        if (config.withdrawal) {
            throw new InvalidWithdrawalConfigError(
                "emergency withdrawal needs an accounts drive, mark a raw drive or an nvram with accounts_drive = true",
            );
        }
        return;
    }

    const { label } = accountsDrive;

    let size: number | undefined;
    if (accountsDrive.kind === "flash_drive") {
        const drive = config.drives[label];
        if (drive.builder !== "empty" || drive.format !== "raw") {
            throw new InvalidAccountsDriveError(
                label,
                `it must not have a filesystem, use builder = "empty" and format = "raw", or declare it under [nvrams.${label}]`,
            );
        }
        if (drive.mount !== undefined && drive.mount !== false) {
            throw new InvalidAccountsDriveError(
                label,
                "it can't be mounted, remove 'mount' or set it to false",
            );
        }
        size = drive.size;
    } else {
        // the size of an nvram backed by an existing image is only known once built
        size = config.nvrams[label].size;
    }

    assertAccountsDriveLength(config, accountsDrive, size);
};
