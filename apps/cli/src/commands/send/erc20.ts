import { Command } from "@commander-js/extra-typings";
import input from "@inquirer/input";
import ora from "ora";
import {
    type Address,
    type PublicClient,
    erc20Abi,
    getAddress,
    isAddress,
    parseEther,
} from "viem";
import { erc20PortalAbi, erc20PortalAddress } from "../../contracts.js";
import {
    type SendCommandOpts,
    connect,
    getInputApplicationAddress,
} from "../send.js";

type ERC20Token = {
    name: string;
    symbol: string;
    decimals: number;
};

const readToken = async (
    publicClient: PublicClient,
    address: Address,
): Promise<ERC20Token> => {
    const args = { abi: erc20Abi, address };
    const symbol = await publicClient.readContract({
        ...args,
        functionName: "symbol",
    });
    const name = await publicClient.readContract({
        ...args,
        functionName: "name",
    });
    const decimals = await publicClient.readContract({
        ...args,
        functionName: "decimals",
    });
    return {
        name,
        symbol,
        decimals,
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

export const createErc20Command = () => {
    return new Command<[], {}, SendCommandOpts>("erc20")
        .description(
            "Sends ERC-20 deposits to the application, optionally in interactive mode.",
        )
        .configureHelp({ showGlobalOptions: true })
        .option("--token <address>", "token address")
        .option("--amount <number>", "amount to send")
        .action(async (options, command) => {
            const sendOptions = command.optsWithGlobals();

            // connect to RPC provider
            const { publicClient, walletClient } = await connect(sendOptions);

            // get dapp address from local node, or ask
            const applicationAddress = await getInputApplicationAddress(
                sendOptions.dapp,
            );

            const tokenAddress =
                options.token && isAddress(options.token)
                    ? getAddress(options.token)
                    : ((await input({
                          message: "Token address",
                          validate: ercValidator(publicClient),
                      })) as Address);

            const amount =
                options.amount || (await input({ message: "Amount" }));

            const { request } = await publicClient.simulateContract({
                address: erc20PortalAddress,
                abi: erc20PortalAbi,
                functionName: "depositERC20Tokens",
                args: [
                    tokenAddress,
                    applicationAddress,
                    parseEther(amount as `${number}`), // XXX: we need to use the token decimals here!
                    "0x",
                ],
                account: walletClient.account,
            });

            const hash = await walletClient.writeContract(request);
            const progress = ora("Sending input...").start();
            await publicClient.waitForTransactionReceipt({ hash });
            progress.succeed(`Input sent: ${hash}`);
        });
};
