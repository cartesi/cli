import { Command, Option } from "@commander-js/extra-typings";
import { withdraw } from "../api/withdraw.js";
import { getProjectName, parseAddress } from "../base.js";
import { handleNodeCommandError } from "../exec/node-container.js";
import { resolveNodeApplication } from "../node.js";
import { addRecoveryOptions } from "./recovery.js";
import { addressInput } from "../prompts.js";
import { assertForeclosed } from "../withdraw.js";

export const createWithdrawCommand = () => {
    return addRecoveryOptions(
        new Command("withdraw")
            .description(
                "Withdraws the funds of an account from a foreclosed application",
            )
            .configureHelp({ showGlobalOptions: true })
            .addOption(
                new Option(
                    "--account <address>",
                    "account to withdraw the funds of",
                ).argParser(parseAddress),
            )
            .addOption(
                new Option(
                    "--proof-file <path>",
                    "withdraw proof generated elsewhere, instead of generating it",
                ).conflicts("account"),
            ),
        "index of the account in the node mnemonic paying for gas",
    ).action(async (options) => {
        const { proofFile } = options;
        const projectName = getProjectName(options);

        // ask for the account only once the application is known to be
        // foreclosed, so a mistake fails before the prompt
        let account = options.account;
        if (!proofFile && !account) {
            const application = await resolveNodeApplication({
                application: options.application,
                projectName,
            });
            await assertForeclosed({ application, projectName });
            account = await addressInput({
                message: "Account to withdraw the funds of",
            });
        }

        try {
            await withdraw({
                ...options,
                account,
                progress: "default",
                stream: true,
            });
        } catch (error: unknown) {
            handleNodeCommandError(error);
        }
    });
};
