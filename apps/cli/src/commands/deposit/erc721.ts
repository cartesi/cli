import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import ora from "ora";
import {
    type Address,
    BaseError,
    ContractFunctionRevertedError,
    type PublicClient,
    erc721Abi,
    getAddress,
    isAddress,
    isHex,
} from "viem";
import { getProjectName } from "../../base.js";
import {
    erc721PortalAbi,
    erc721PortalAddress,
    testNftAbi,
    testNftAddress,
} from "../../contracts.js";
import {
    addressInput,
    bigintInput,
    getInputApplicationAddress,
} from "../../prompts.js";
import { connect } from "../../wallet.js";
import type { DepositCommandOpts } from "../deposit.js";

type ERC721Token = {
    address: Address;
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
        address,
        name,
        symbol,
    };
};

const parseToken = async (options: {
    testClient: PublicClient;
    token?: string;
}): Promise<ERC721Token> => {
    const { testClient } = options;

    const address =
        options.token && isAddress(options.token)
            ? getAddress(options.token)
            : await addressInput({
                  message: "Token address",
                  default: testNftAddress,
              });

    return readToken(testClient, address);
};

export const createErc721Command = () => {
    return new Command<[], Record<string, never>, DepositCommandOpts>("erc721")
        .description("Deposit ERC-721 to the application")
        .configureHelp({ showGlobalOptions: true })
        .argument("[token-id]", "token ID")
        .option("--token <address>", "token address")
        .option("--base-layer-data <hex>", "base layer data", "0x")
        .option("--exec-layer-data <hex>", "exec layer data", "0x")
        .action(async (tokenIdStr, options, command) => {
            const { from } = command.optsWithGlobals();

            const tokenId = tokenIdStr
                ? BigInt(tokenIdStr)
                : await bigintInput({ decimals: 0, message: "Token ID" });

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
            const tokenAbi =
                token.address === testNftAddress ? testNftAbi : erc721Abi;

            // get dapp address from local node, or ask
            const application = await getInputApplicationAddress({
                ...command.optsWithGlobals(),
                projectName,
            });

            const { symbol } = token;

            const baseLayerData = isHex(options.baseLayerData)
                ? options.baseLayerData
                : "0x";
            const execLayerData = isHex(options.execLayerData)
                ? options.execLayerData
                : "0x";

            // progress spinner
            const progress = ora();

            // check balance
            try {
                const currentOwner = await testClient.readContract({
                    abi: tokenAbi,
                    address: token.address,
                    args: [tokenId],
                    functionName: "ownerOf",
                });

                if (currentOwner !== account) {
                    progress.fail("Insufficient balance");
                    return;
                }
            } catch (e: unknown) {
                if (e instanceof BaseError) {
                    const revertError = e.walk(
                        (err) => err instanceof ContractFunctionRevertedError,
                    );
                    if (revertError instanceof ContractFunctionRevertedError) {
                        const errorName = revertError.data?.errorName ?? "";
                        if (errorName === "ERC721NonexistentToken") {
                            progress.fail(`Token ${tokenIdStr} does not exist`);
                            return;
                        }
                    }
                    progress.fail("Failed to check ownership");
                }
            }

            // check allowance
            const operator = await testClient.readContract({
                abi: tokenAbi,
                address: token.address,
                args: [tokenId],
                functionName: "getApproved",
            });

            // for messages
            const amountStr = `${chalk.cyan(tokenIdStr)} ${symbol}`;

            // approve if needed
            if (operator !== erc721PortalAddress) {
                progress.start(`Approving ${amountStr}...`);
                const { request } = await testClient.simulateContract({
                    abi: tokenAbi,
                    account,
                    address: token.address,
                    functionName: "approve",
                    args: [erc721PortalAddress, tokenId],
                });
                const hash = await testClient.writeContract(request);
                await testClient.waitForTransactionReceipt({ hash });
                progress.succeed(`Approved ${amountStr}`);
            }

            // simulate deposit call
            const { request } = await testClient.simulateContract({
                abi: erc721PortalAbi,
                account,
                address: erc721PortalAddress,
                functionName: "depositERC721Token",
                args: [
                    token.address,
                    application,
                    tokenId,
                    baseLayerData,
                    execLayerData,
                ],
            });

            // send deposit
            progress.start(
                `Depositing ${amountStr} to ${chalk.cyan(application)}...`,
            );
            const hash = await testClient.writeContract(request);
            await testClient.waitForTransactionReceipt({ hash });
            progress.succeed(
                `Deposited ${amountStr} to ${chalk.cyan(application)}`,
            );
        });
};
