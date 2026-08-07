import ora from "ora";
import { DepositError } from "../../api/deposit/common.js";

/**
 * Report a deposit that could not be made because of the asset, the amount or
 * the balance of the sender. Any other error is rethrown.
 * @param e error thrown by a deposit
 */
export const reportDepositError = (e: unknown): void => {
    if (e instanceof DepositError) {
        ora().fail(e.message);
        return;
    }
    throw e;
};
