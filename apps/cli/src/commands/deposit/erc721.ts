import { Command } from "@commander-js/extra-typings";
import { type Address, getAddress, isAddress, isHex } from "viem";
import { depositErc721 } from "../../api/deposit/erc721.js";
import { getProjectName } from "../../base.js";
import { testNonFungibleTokenAddress } from "../../contracts.js";
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
              default: testNonFungibleTokenAddress,
          });

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
            const client = await connect(command.optsWithGlobals());

            // the input sender, impersonated
            const account =
                from && isAddress(from)
                    ? getAddress(from)
                    : (await client.getAddresses())[0];

            const token = await parseTokenAddress(options.token);

            // get dapp address from local node, or ask
            const application = await getInputApplicationAddress({
                ...command.optsWithGlobals(),
                projectName,
            });

            const baseLayerData = isHex(options.baseLayerData)
                ? options.baseLayerData
                : "0x";
            const execLayerData = isHex(options.execLayerData)
                ? options.execLayerData
                : "0x";

            try {
                await depositErc721({
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
