import { Command } from "@commander-js/extra-typings";
import select from "@inquirer/select";
import {
    createErc1155BatchCommand,
    createErc1155SingleCommand,
} from "./deposit/erc1155.js";
import { createErc20Command } from "./deposit/erc20.js";
import { createErc721Command } from "./deposit/erc721.js";
import { createEtherCommand } from "./deposit/ether.js";

export const createDepositCommand = () => {
    const command = new Command("deposit")
        .description("Deposits an asset to the application")
        .configureHelp({ showGlobalOptions: true })
        .option("--from <address>", "input sender address")
        .option("--application <address>", "application address")
        .option(
            "--project-name <string>",
            "name of project (used by docker compose and cartesi-rollups-node)",
        )
        .option("--rpc-url <url>", "RPC URL of the Cartesi Devnet")
        .action(async (_options, command) => {
            // get registered subcommands
            const commands = command.commands;

            // create choices for the selected prompt based on registered subcommands
            const choices = commands.map((cmd) => ({
                name: cmd.name(),
                value: cmd,
                description: cmd.description(),
            }));

            const subcommand = await select({
                choices,
                message: "Select type of asset to deposit",
            });

            // execute selected subcommand
            subcommand.parseAsync(command.args);
        });

    command.addCommand(createEtherCommand());
    command.addCommand(createErc20Command());
    command.addCommand(createErc721Command());
    command.addCommand(createErc1155SingleCommand());
    command.addCommand(createErc1155BatchCommand());

    return command;
};

export type DepositCommandOpts = ReturnType<
    ReturnType<typeof createDepositCommand>["opts"]
>;
