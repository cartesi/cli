import { Command } from "@commander-js/extra-typings";
import { refund } from "../api/refund.js";
import { parseInputIndex } from "../base.js";
import { handleNodeCommandError } from "../exec/node-container.js";
import { addRecoveryOptions } from "./recovery.js";

export const createRefundCommand = () => {
    return addRecoveryOptions(
        new Command("refund")
            .description(
                "Refunds a deposit that was not finalized before the application was foreclosed",
            )
            .configureHelp({ showGlobalOptions: true })
            .argument(
                "<input-index>",
                "index of the deposit input",
                parseInputIndex,
            )
            .option(
                "--input-file <path>",
                "file with the 0x-prefixed InputAdded.input bytes (default: read from the node)",
            ),
        "index of the account in the node mnemonic paying for gas",
    ).action(async (inputIndex, options) => {
        try {
            await refund({ ...options, inputIndex, stream: true });
        } catch (error: unknown) {
            handleNodeCommandError(error);
        }
    });
};
