import { Command } from "@commander-js/extra-typings";
import input from "@inquirer/input";
import { type Address, getAddress, isAddress, isHex } from "viem";
import {
    depositErc1155,
    depositErc1155Batch,
} from "../../api/deposit/erc1155.js";
import { getProjectName } from "../../base.js";
import { testMultiTokenAddress } from "../../contracts.js";
import {
    addressInput,
    bigintInput,
    getInputApplicationAddress,
} from "../../prompts.js";
import { connect } from "../../wallet.js";
import type { DepositCommandOpts } from "../deposit.js";
import { reportDepositError } from "./error.js";

const parseTokenAddress = async (token?: string): Promise<Address> =>
    token && isAddress(token)
        ? getAddress(token)
        : addressInput({
              message: "Token address",
              default: testMultiTokenAddress,
          });

const parseBigints = (value: string): bigint[] =>
    value.split(",").map((v) => BigInt(v.trim()));

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
            const client = await connect(command.optsWithGlobals());

            const token = await parseTokenAddress(options.token);

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
                    : (await client.getAddresses())[0];

            const amount = amountString
                ? BigInt(amountString)
                : await bigintInput({
                      message: `Amount of token ID ${tokenId}`,
                      decimals: 0,
                  });

            const baseLayerData = isHex(options.baseLayerData)
                ? options.baseLayerData
                : "0x";
            const execLayerData = isHex(options.execLayerData)
                ? options.execLayerData
                : "0x";

            try {
                await depositErc1155({
                    amount,
                    application,
                    baseLayerData,
                    client,
                    execLayerData,
                    from: account,
                    progress: "default",
                    projectName,
                    token,
                    tokenId,
                });
            } catch (e: unknown) {
                reportDepositError(e);
            }
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
            const client = await connect(command.optsWithGlobals());

            const token = await parseTokenAddress(options.token);

            const tokenIds = parseBigints(
                tokenIdsString ??
                    (await input({ message: "Token IDs (comma separated)" })),
            );

            const amounts = parseBigints(
                amountsString ??
                    (await input({ message: "Amounts (comma separated)" })),
            );

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
                    : (await client.getAddresses())[0];

            const baseLayerData = isHex(options.baseLayerData)
                ? options.baseLayerData
                : "0x";
            const execLayerData = isHex(options.execLayerData)
                ? options.execLayerData
                : "0x";

            try {
                await depositErc1155Batch({
                    amounts,
                    application,
                    baseLayerData,
                    client,
                    execLayerData,
                    from: account,
                    progress: "default",
                    projectName,
                    token,
                    tokenIds,
                });
            } catch (e: unknown) {
                reportDepositError(e);
            }
        });
};
