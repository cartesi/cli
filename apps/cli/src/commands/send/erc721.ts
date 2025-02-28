import { Command } from "@commander-js/extra-typings";
import input from "@inquirer/input";
import ora from "ora";
import { Address, erc721Abi, getAddress, isAddress, PublicClient } from "viem";
import { erc721PortalAbi, erc721PortalAddress } from "../../contracts.js";
import {
    addCommonOptions,
    connect,
    getInputApplicationAddress,
} from "../send.js";

type ERC721Token = {
    name: string;
    symbol: string;
};

const readToken = async (
    publicClient: PublicClient,
    address: Address,
): Promise<ERC721Token> => {
    const args = { abi: erc721Abi, address };
    const symbol = await publicClient.readContract({
        ...args,
        functionName: "symbol",
    });
    const name = await publicClient.readContract({
        ...args,
        functionName: "name",
    });
    return {
        name,
        symbol,
    };
};

const ercValidator =
    (publicClient: PublicClient) =>
    async (value: string): Promise<string | boolean> => {
        if (!isAddress(value)) {
            return "Invalid address";
        }
        try {
            await readToken(publicClient, value);
        } catch (e) {
            return "Invalid token";
        }
        return true;
    };

export const registerErc721Command = (program: Command) => {
    addCommonOptions(
        program
            .command("erc721")
            .description(
                "Sends ERC-721 deposits to the application, optionally in interactive mode.",
            ),
    )
        .option("--token <address>", "token address")
        .option("--token-id <number>", "token ID")
        .action(async (options) => {
            // connect to RPC provider
            const { publicClient, walletClient } = await connect(options);

            // get dapp address from local node, or ask
            const applicationAddress = await getInputApplicationAddress();

            const token =
                options.token && isAddress(options.token)
                    ? getAddress(options.token)
                    : ((await input({
                          message: "Token address",
                          validate: ercValidator(publicClient),
                      })) as Address);

            const tokenId =
                options.tokenId ||
                (await input({
                    message: "Token ID",
                    validate: (value) => {
                        try {
                            BigInt(value);
                            return true;
                        } catch (e) {
                            return "Invalid number";
                        }
                    },
                }));

            const { request } = await publicClient.simulateContract({
                address: erc721PortalAddress,
                abi: erc721PortalAbi,
                functionName: "depositERC721Token",
                args: [token, applicationAddress, BigInt(tokenId), "0x", "0x"],
                account: walletClient.account,
            });
            // XXX: add support for baseLayerData and execLayerData

            const hash = await walletClient.writeContract(request);
            const progress = ora("Sending input...").start();
            await publicClient.waitForTransactionReceipt({ hash });
            progress.succeed(`Input sent: ${hash}`);
        });
};
