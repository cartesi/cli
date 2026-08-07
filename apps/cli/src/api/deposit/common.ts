import chalk from "chalk";
import ora from "ora";
import { type Address, type Hash, type Hex, parseUnits } from "viem";
import type { ConnectionOptions } from "../connection.js";
import type { ProgressOptions } from "../types.js";

/** Base class of the errors of a deposit that could not be made. */
export class DepositError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "DepositError";
    }
}

/** The sender does not own enough of the asset being deposited. */
export class InsufficientBalanceError extends DepositError {
    constructor(message = "Insufficient balance") {
        super(message);
        this.name = "InsufficientBalanceError";
    }
}

/** The amount being deposited is not valid. */
export class InvalidAmountError extends DepositError {
    constructor(message: string) {
        super(message);
        this.name = "InvalidAmountError";
    }
}

/** The token being deposited does not exist. */
export class TokenNotFoundError extends DepositError {
    constructor(message: string) {
        super(message);
        this.name = "TokenNotFoundError";
    }
}

/**
 * An amount of an asset, either in its base unit (as a `bigint`), or in its
 * display unit (as a string, like `"1.5"`), converted using the number of
 * decimals of the asset.
 */
export type Amount = bigint | string;

export type DepositOptions = ConnectionOptions &
    ProgressOptions & {
        /**
         * Additional data forwarded to the application.
         * @default "0x"
         */
        execLayerData?: Hex;
    };

export type PortalDepositOptions = DepositOptions & {
    /**
     * Additional data forwarded to the base layer.
     * @default "0x"
     */
    baseLayerData?: Hex;
};

export type DepositResult = {
    /** Address of the application the asset was deposited to. */
    application: Address;

    /** Address of the sender of the deposit. */
    from: Address;

    /** Hash of the deposit transaction. */
    transactionHash: Hash;

    /** Hash of the approval transaction, when an approval was necessary. */
    approvalTransactionHash?: Hash;
};

/**
 * Convert an {@link Amount} to the base unit of the asset.
 * @param amount amount in base units, or in display units as a string
 * @param decimals number of decimals of the asset
 * @returns the amount in the base unit of the asset
 */
export const parseAmount = (amount: Amount, decimals: number): bigint =>
    typeof amount === "bigint" ? amount : parseUnits(amount, decimals);

/**
 * Create the spinner used to report the progress of a deposit, silent unless
 * the caller asked for progress.
 */
export const depositSpinner = (options: ProgressOptions) =>
    ora({ isSilent: (options.progress ?? "silent") === "silent" });

/** Label of an application address, used in progress messages. */
export const applicationLabel = (application: Address) =>
    chalk.cyan(application);
