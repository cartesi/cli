import { Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import { isAddressEqual, zeroAddress } from "viem";
import { getProjectName } from "../base.js";
import {
    handleNodeCommandError,
    runNodeCommand,
    transactionArgs,
} from "../exec/rollups.js";
import {
    getNodeClient,
    parseAccountIndex,
    resolveNodeApplication,
} from "../node.js";
import { findMnemonicAccountIndex, getNodeMnemonic } from "../wallet.js";

export const createForecloseCommand = () => {
    return new Command("foreclose")
        .description(
            "Forecloses the application, so users can withdraw their funds",
        )
        .configureHelp({ showGlobalOptions: true })
        .option("--application <address>", "application address")
        .option(
            "--project-name <string>",
            "name of project (used by docker compose and cartesi-rollups-node)",
        )
        .addOption(
            new Option(
                "--account-index <index>",
                "index of the guardian account in the node mnemonic (default: derived from the application guardian)",
            ).argParser(parseAccountIndex),
        )
        .option("-y, --yes", "skip the confirmation prompt")
        .option("--json", "print the result as JSON")
        .option(
            "--no-wait",
            "return after broadcast without waiting for the receipt",
        )
        .option(
            "--wait-timeout <duration>",
            "maximum time to wait for the receipt (e.g. 30s, 5m)",
        )
        .action(async (options) => {
            const projectName = getProjectName(options);
            const application = await resolveNodeApplication({
                application: options.application,
                projectName,
            });

            // the guardian is the only account allowed to foreclose
            let accountIndex = options.accountIndex;
            if (accountIndex === undefined) {
                const client = await getNodeClient({ projectName });
                const { withdrawalConfig } = await client.getApplication({
                    application,
                });
                const { guardian } = withdrawalConfig;
                if (isAddressEqual(guardian, zeroAddress)) {
                    throw new Error(
                        `Application ${chalk.cyan(application)} was deployed without a withdrawal config and cannot be foreclosed`,
                    );
                }
                accountIndex = findMnemonicAccountIndex({
                    address: guardian,
                    mnemonic: getNodeMnemonic(),
                });
                if (accountIndex === undefined) {
                    throw new Error(
                        `Guardian ${chalk.cyan(guardian)} is not derived from the node mnemonic, use ${chalk.cyan("--account-index")}`,
                    );
                }
            }

            try {
                await runNodeCommand({
                    accountIndex,
                    command: [
                        "cartesi-rollups-cli",
                        "foreclose",
                        application,
                        ...transactionArgs(options),
                    ],
                    projectName,
                });
            } catch (error: unknown) {
                handleNodeCommandError(error);
            }
        });
};
