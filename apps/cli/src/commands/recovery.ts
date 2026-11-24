import {
    type Command,
    Option,
    type OptionValues,
} from "@commander-js/extra-typings";
import { parseAccountIndex } from "../base.js";

/**
 * Add the options shared by the fund recovery commands: the application and
 * project, the signer account index, and the transaction flags forwarded to
 * cartesi-rollups-cli
 * @param accountIndexDescription what the account index selects for this command
 */
export const addRecoveryOptions = <
    Args extends unknown[],
    Opts extends OptionValues,
    GlobalOpts extends OptionValues,
>(
    command: Command<Args, Opts, GlobalOpts>,
    accountIndexDescription: string,
) =>
    command
        .option("--application <address>", "application address")
        .option(
            "--project-name <string>",
            "name of project (used by cartesi-rollups-node)",
        )
        .addOption(
            new Option(
                "--account-index <index>",
                accountIndexDescription,
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
        );
