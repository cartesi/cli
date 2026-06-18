import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import ora from "ora";
import {
    type Address,
    type PublicClient,
    erc20Abi,
    formatUnits,
    getAddress,
    isAddress,
    isHex,
    parseUnits,
} from "viem";
import { getProjectName } from "../../base.js";
import {
    erc20PortalAbi,
    erc20PortalAddress,
    testFungibleTokenAddress,
} from "../../contracts.js";
import {
    addressInput,
    bigintInput,
    getInputApplicationAddress,
} from "../../prompts.js";
import { connect } from "../../wallet.js";
import type { DepositCommandOpts } from "../deposit.js";

type ERC20Token = {
    address: Address;
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
        address,
        name,
        symbol,
        decimals,
    };
};

const parseToken = async (options: {
    testClient: PublicClient;
    token?: string;
}): Promise<ERC20Token> => {
    const { testClient } = options;

    const address =
        options.token && isAddress(options.token)
            ? getAddress(options.token)
            : await addressInput({
                  message: "Token address",
                  default: testFungibleTokenAddress,
              });

    return readToken(testClient, address);
};

export const createErc20Command = () => {
    return new Command<[], Record<string, never>, DepositCommandOpts>("erc20")
        .description("Deposit ERC-20 to the application")
        .configureHelp({ showGlobalOptions: true })
        .argument("[amount]", "amount to send")
        .option("--token <address>", "token address")
        .option("--exec-layer-data <hex>", "exec layer data", "0x")
        .action(async (amountStr, options, command) => {
            const { from } = command.optsWithGlobals();

            const projectName = getProjectName(command.optsWithGlobals());

            // connect to anvil
            const testClient = await connect(command.optsWithGlobals());

            // the input sender, impersonated
            const account =
                from && isAddress(from)
                    ? getAddress(from)
                    : (await testClient.getAddresses())[0];

            const token = await parseToken({
                testClient,
                token: options.token,
            });

            // get dapp address from local node, or ask
            const application = await getInputApplicationAddress({
                ...command.optsWithGlobals(),
                projectName,
            });

            const { decimals, symbol } = token;
            const amount = amountStr
                ? parseUnits(amountStr, decimals)
                : await bigintInput({
                      message: `Amount (${symbol})`,
                      decimals,
                  });

            const execLayerData = isHex(options.execLayerData)
                ? options.execLayerData
                : "0x";

            // progress spinner
            const progress = ora();

            // check balance
            const balance = await testClient.readContract({
                abi: erc20Abi,
                address: token.address,
                functionName: "balanceOf",
                args: [account],
            });
            if (balance < amount) {
                progress.fail("Insufficient balance");
                return;
            }

            // check allowance
            const allowance = await testClient.readContract({
                abi: erc20Abi,
                address: token.address,
                functionName: "allowance",
                args: [account, erc20PortalAddress],
            });

            // for messages
            const amountLabel = `${chalk.cyan(formatUnits(amount, decimals))} ${symbol}`;

            // approve if needed
            if (allowance < amount) {
                progress.start(`Approving ${amountLabel}...`);
                const { request } = await testClient.simulateContract({
                    abi: erc20Abi,
                    account,
                    address: token.address,
                    functionName: "approve",
                    args: [erc20PortalAddress, amount],
                });
                const hash = await testClient.writeContract(request);
                await testClient.waitForTransactionReceipt({ hash });
                progress.succeed(`Approved ${amountLabel}`);
            }

            // simulate deposit call
            const { request } = await testClient.simulateContract({
                abi: erc20PortalAbi,
                account,
                address: erc20PortalAddress,
                functionName: "depositERC20Tokens",
                args: [token.address, application, amount, execLayerData],
            });

            // send deposit
            progress.start(
                `Depositing ${amountLabel} to ${chalk.cyan(application)}...`,
            );
            const hash = await testClient.writeContract(request);
            await testClient.waitForTransactionReceipt({ hash });
            progress.succeed(
                `Deposited ${amountLabel} to ${chalk.cyan(application)}`,
            );
        });
};
