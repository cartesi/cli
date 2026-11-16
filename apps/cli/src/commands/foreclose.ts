import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import { foreclose } from "../api/foreclose.js";
import { handleNodeCommandError } from "../exec/node-container.js";
import { addRecoveryOptions } from "./recovery.js";

export const createForecloseCommand = () => {
    return addRecoveryOptions(
        new Command("foreclose")
            .description(
                "Forecloses the application, so users can withdraw their funds",
            )
            .addHelpText(
                "after",
                `
Signs as the application guardian. By default it uses the rollups node signer, looking up the guardian in its mnemonic.
For a guardian outside it, set the signer for this command only:
  CARTESI_AUTH_MNEMONIC="<mnemonic>" cartesi foreclose
  CARTESI_AUTH_PRIVATE_KEY=<0x-private-key> cartesi foreclose
Set CARTESI_AUTH_KIND to mnemonic or private_key when both are set.`,
            )
            .configureHelp({ showGlobalOptions: true }),
        "index of the guardian in the mnemonic (default: looked up from the application guardian; ignored for private-key signers)",
    ).action(async (options) => {
        try {
            await foreclose({
                ...options,
                onNotice: ({ message }) => console.warn(chalk.yellow(message)),
                stream: true,
            });
        } catch (error: unknown) {
            handleNodeCommandError(error);
        }
    });
};
