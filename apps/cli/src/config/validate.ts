import {
    formatValue,
    InvalidAccountsDriveError,
    InvalidWithdrawalConfigError,
    MultipleAccountsDrivesError,
} from "./errors.js";
import {
    assertAccountsDriveLength,
    type Config,
    getMarkedDrives,
    LOG2_LEAF_SIZE,
    log2OfPowerOfTwo,
} from "./types.js";

/**
 * Validation that spans several sections of the configuration, and so applies
 * to every format it can be written in.
 */

/**
 * Checks `account_size`, which divides the accounts drive into accounts and so
 * must be a power of two of at least one 32-byte leaf.
 * @param size parsed size, or `undefined` when it could not be read
 * @param value size as written, for the error message
 * @returns the account size in bytes
 */
export const assertAccountSize = (
    size: number | undefined,
    value: unknown,
): number => {
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
