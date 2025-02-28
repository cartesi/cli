import { Command } from "@commander-js/extra-typings";
import input from "@inquirer/input";
import select from "@inquirer/select";
import { Address, isAddress, PublicClient, WalletClient } from "viem";
import { getApplicationAddress } from "../base.js";
import createClients, { supportedChains } from "../wallet.js";
import { registerErc20Command } from "./send/erc20.js";
import { registerErc721Command } from "./send/erc721.js";
import { registerEtherCommand } from "./send/ether.js";
import { registerGenericCommand } from "./send/generic.js";

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
            (c) => c.id == chainId,
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

export const addCommonOptions = (command: Command) => {
    return command
        .option("--dapp <address>", "Application address")
        .option("--chain-id <id>", "Chain ID", parseInt)
        .option("--rpc-url <url>", "RPC URL")
        .option("--mnemonic <phrase>", "Mnemonic passphrase")
        .option(
            "--mnemonic-index <index>",
            "Mnemonic account index",
            parseInt,
            0,
        );
};

export const registerSendCommand = (program: Command) => {
    const sendCommand = addCommonOptions(
        program
            .command("send")
            .description(
                "Sends different kinds of input to the application in interactive mode.",
            ),
    ).action(async (options, program) => {
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
    registerErc20Command(sendCommand);
    registerErc721Command(sendCommand);
    registerEtherCommand(sendCommand);
    registerGenericCommand(sendCommand);
};
