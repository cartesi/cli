import { Command } from "@commander-js/extra-typings";
import input from "@inquirer/input";
import select from "@inquirer/select";
import {
    type Address,
    type PublicClient,
    type WalletClient,
    isAddress,
} from "viem";
import { parseAddress } from "../base.js";
import { getApplicationAddress } from "../exec/rollups.js";
import createClients, { supportedChains } from "../wallet.js";
import { createErc20Command } from "./send/erc20.js";
import { createErc721Command } from "./send/erc721.js";
import { createEtherCommand } from "./send/ether.js";
import { createGenericCommand } from "./send/generic.js";

export const connect = (options: {
    chainId?: number;
    rpcUrl?: string;
    mnemonic?: string;
    mnemonicIndex: number;
}): Promise<{
    publicClient: PublicClient;
    walletClient: WalletClient;
}> => {
    const { chainId, rpcUrl, mnemonic, mnemonicIndex } = options;

    // create viem clients
    return createClients({
        chain: supportedChains({ includeDevnet: true }).find(
            (c) => c.id === chainId,
        ),
        rpcUrl,
        mnemonicPassphrase: mnemonic,
        mnemonicIndex,
    });
};

export const getInputApplicationAddress = async (
    dapp?: string,
): Promise<Address> => {
    if (dapp && isAddress(dapp)) {
        // honor the flag
        return dapp;
    }

    // get the running container dapp address
    const nodeAddress = await getApplicationAddress();

    // query for the address
    const applicationAddress = await input({
        message: "Application address",
        validate: (value) => isAddress(value) || "Invalid address",
        default: nodeAddress,
    });

    return applicationAddress as Address;
};

export const createSendCommand = () => {
    const command = new Command("send")
        .description(
            "Sends different kinds of input to the application in interactive mode.",
        )
        .option("--chain-id <id>", "Chain ID", Number.parseInt, 13370)
        .option("--rpc-url <url>", "RPC URL")
        .option("--mnemonic <phrase>", "Mnemonic passphrase")
        .option(
            "--mnemonic-index <index>",
            "Mnemonic account index",
            Number.parseInt,
            0,
        )
        .option(
            "--dapp <address>",
            "Application address",
            parseAddress,
            undefined,
        )
        .action(async (options, program) => {
            // Get the registered subcommands from the program
            const commands = program.commands;

            // Create choices for the select prompt based on registered commands
            const choices = commands.map((cmd) => ({
                name: cmd.name(),
                value: cmd,
                description: cmd.description(),
            }));

            // Present the list of subcommands using @inquirer/select
            const subcommand = await select({
                message: "Select the type of input to send",
                choices,
            });

            // Execute the selected subcommand
            subcommand.parseAsync(program.args);
        });
    command.addCommand(createGenericCommand());
    command.addCommand(createErc20Command());
    command.addCommand(createErc721Command());
    command.addCommand(createEtherCommand());
    return command;
};

export type SendCommandOpts = ReturnType<
    ReturnType<typeof createSendCommand>["opts"]
>;
