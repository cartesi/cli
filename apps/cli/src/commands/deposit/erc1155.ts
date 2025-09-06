import { Command } from "@commander-js/extra-typings";
import input from "@inquirer/input";
import chalk from "chalk";
import ora from "ora";
import { type Address, getAddress, isAddress, isHex } from "viem";
import { getProjectName } from "../../base.js";
import {
    erc1155BatchPortalAbi,
    erc1155BatchPortalAddress,
    erc1155SinglePortalAbi,
    erc1155SinglePortalAddress,
    testMultiTokenAbi,
    testMultiTokenAddress,
} from "../../contracts.js";
import {
    addressInput,
    bigintInput,
    getInputApplicationAddress,
} from "../../prompts.js";
import { connect } from "../../wallet.js";
import type { DepositCommandOpts } from "../deposit.js";

type ERC1155Token = {
    address: Address;
    name: string;
};

const parseToken = async (options: {
    token?: string;
}): Promise<ERC1155Token> => {
    const address =
        options.token && isAddress(options.token)
            ? getAddress(options.token)
            : await addressInput({
                  message: "Token address",
                  default: testMultiTokenAddress,
              });

    return { address, name: "TestMultiToken" };
};

export const createErc1155SingleCommand = () => {
    return new Command<[], Record<string, never>, DepositCommandOpts>(
        "erc1155-single",
    )
        .description("Deposits an ERC1155 token to the application")
        .configureHelp({ showGlobalOptions: true })
        .argument("[token-id]", "token ID")
        .argument("[amount]", "amount to send")
        .option("--token <address>", "ERC1155 token address")
        .option("--base-layer-data <hex>", "base layer data", "0x")
        .option("--exec-layer-data <hex>", "exec layer data", "0x")
        .action(async (tokenIdString, amountString, options, command) => {
            const { from } = command.optsWithGlobals();

            // connect to anvil
            const testClient = await connect(command.optsWithGlobals());

            const token = await parseToken({
                token: options.token,
            });

            const tokenId = tokenIdString
                ? BigInt(tokenIdString)
                : await bigintInput({ decimals: 0, message: "Token ID" });
            const projectName = getProjectName(command.optsWithGlobals());

            // get dapp address from local node, or ask
            const application = await getInputApplicationAddress({
                ...command.optsWithGlobals(),
                projectName,
            });

            // the input sender, impersonated
            const account =
                from && isAddress(from)
                    ? getAddress(from)
                    : (await testClient.getAddresses())[0];

            const amount = amountString
                ? BigInt(amountString)
                : await bigintInput({
                      message: `Amount of token ID ${tokenId}`,
                      decimals: 0,
                  });

            // ensure amount is positive
            if (amount <= BigInt(0)) {
                console.error(
                    chalk.red(
                        "Amount of tokens to be deposited, must be greater than zero.",
                    ),
                );
                return;
            }

            const tokenAbi = testMultiTokenAbi;

            const baseLayerData = isHex(options.baseLayerData)
                ? options.baseLayerData
                : "0x";
            const execLayerData = isHex(options.execLayerData)
                ? options.execLayerData
                : "0x";

            // progress spinner
            const progress = ora();

            // check balance
            const balance = await testClient.readContract({
                abi: tokenAbi,
                address: token.address,
                functionName: "balanceOf",
                args: [account, tokenId],
            });
            if (balance < amount) {
                progress.fail("Insufficient balance");
                return;
            }

            // check if sufficiently approved
            const isApproved = await testClient.readContract({
                abi: tokenAbi,
                address: token.address,
                functionName: "isApprovedForAll",
                args: [account, erc1155SinglePortalAddress],
            });

            // approve if needed
            if (isApproved === false) {
                progress.start(`Approving ERC1155Portal...`);
                const { request } = await testClient.simulateContract({
                    abi: tokenAbi,
                    account,
                    address: token.address,
                    functionName: "setApprovalForAll",
                    args: [erc1155SinglePortalAddress, true],
                });
                const hash = await testClient.writeContract(request);
                await testClient.waitForTransactionReceipt({ hash });
                progress.succeed(`Approved ERC1155Portal`);
            }

            // simulate deposit call
            const { request } = await testClient.simulateContract({
                abi: erc1155SinglePortalAbi,
                account,
                address: erc1155SinglePortalAddress,
                functionName: "depositSingleERC1155Token",
                args: [
                    token.address,
                    application,
                    tokenId,
                    amount,
                    baseLayerData,
                    execLayerData,
                ],
            });

            // for messages
            const amountLabel = `${chalk.cyan(amount)} units of token id ${tokenId}`;

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

export const createErc1155BatchCommand = () => {
    return new Command<[], Record<string, never>, DepositCommandOpts>(
        "erc1155-batch",
    )
        .description("Deposits multiple ERC1155 tokens to the application")
        .configureHelp({ showGlobalOptions: true })
        .argument("[token-ids]", "token IDs separated by comma")
        .argument("[amounts]", "amounts separated by comma")
        .option("--token <address>", "ERC1155 token address")
        .option("--base-layer-data <hex>", "base layer data", "0x")
        .option("--exec-layer-data <hex>", "exec layer data", "0x")
        .action(async (tokenIdsString, amountsString, options, command) => {
            const { from } = command.optsWithGlobals();

            // connect to anvil
            const testClient = await connect(command.optsWithGlobals());

            const token = await parseToken({
                token: options.token,
            });

            // Parse token IDs
            let tokenIds: bigint[];

            if (tokenIdsString) {
                tokenIds = tokenIdsString
                    .split(",")
                    .map((id) => BigInt(id.trim()));
            } else {
                // Prompt for token IDs if not provided
                const user_input = await input({
                    message: "Token IDs (comma separated)",
                });
                tokenIds = user_input.split(",").map((id) => BigInt(id.trim()));
            }

            // Parse amounts
            let amounts: bigint[];

            if (amountsString) {
                amounts = amountsString.split(",").map((a) => BigInt(a.trim()));
            } else {
                // Prompt for amounts if not provided
                const user_input = await input({
                    message: "Amounts (comma separated)",
                });
                amounts = user_input.split(",").map((a) => BigInt(a.trim()));
            }

            if (tokenIds.length !== amounts.length) {
                console.error(
                    chalk.red(
                        "Token IDs and amounts must have the same length.",
                    ),
                );
                return;
            }

            for (let i = 0; i < amounts.length; i++) {
                if (amounts[i] <= BigInt(0)) {
                    console.error(
                        chalk.red(
                            `Amount of token Id: ${tokenIds[i]} to be deposited, must be greater than zero.`,
                        ),
                    );
                    return;
                }
            }

            const projectName = getProjectName(command.optsWithGlobals());

            // get dapp address from local node, or ask
            const application = await getInputApplicationAddress({
                ...command.optsWithGlobals(),
                projectName,
            });

            // the input sender, impersonated
            const account =
                from && isAddress(from)
                    ? getAddress(from)
                    : (await testClient.getAddresses())[0];

            const tokenAbi = testMultiTokenAbi;

            const baseLayerData = isHex(options.baseLayerData)
                ? options.baseLayerData
                : "0x";
            const execLayerData = isHex(options.execLayerData)
                ? options.execLayerData
                : "0x";

            // progress spinner
            const progress = ora();

            // check balances
            for (let i = 0; i < tokenIds.length; i++) {
                const balance = await testClient.readContract({
                    abi: tokenAbi,
                    address: token.address,
                    functionName: "balanceOf",
                    args: [account, tokenIds[i]],
                });
                if (balance < amounts[i]) {
                    progress.fail(
                        `Insufficient balance for token ID ${tokenIds[i]}`,
                    );
                    return;
                }
            }

            // check if sufficiently approved
            const isApproved = await testClient.readContract({
                abi: tokenAbi,
                address: token.address,
                functionName: "isApprovedForAll",
                args: [account, erc1155BatchPortalAddress],
            });

            // approve if needed
            if (isApproved === false) {
                progress.start(`Approving ERC1155Portal...`);
                const { request } = await testClient.simulateContract({
                    abi: tokenAbi,
                    account,
                    address: token.address,
                    functionName: "setApprovalForAll",
                    args: [erc1155BatchPortalAddress, true],
                });
                const hash = await testClient.writeContract(request);
                await testClient.waitForTransactionReceipt({ hash });
                progress.succeed(`Approved ERC1155Portal`);
            }

            // simulate batch deposit call
            const { request } = await testClient.simulateContract({
                abi: erc1155BatchPortalAbi,
                account,
                address: erc1155BatchPortalAddress,
                functionName: "depositBatchERC1155Token",
                args: [
                    token.address,
                    application,
                    tokenIds,
                    amounts,
                    baseLayerData,
                    execLayerData,
                ],
            });

            // for messages
            const amountLabel = tokenIds
                .map(
                    (id, i) =>
                        `${chalk.cyan(amounts[i])} units of token id ${id}`,
                )
                .join(", ");

            // send deposit
            progress.start(
                `Depositing tokens to ${chalk.cyan(application)}...`,
            );
            const hash = await testClient.writeContract(request);
            await testClient.waitForTransactionReceipt({ hash });
            progress.succeed(
                `Deposited ${amountLabel} to ${chalk.cyan(application)}`,
            );
        });
};
