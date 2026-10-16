import { Command } from "@commander-js/extra-typings";
import { type Address, getAddress, isAddress, isHex } from "viem";
import { depositErc20, readErc20Token } from "../../api/deposit/erc20.js";
import { getProjectName } from "../../base.js";
import { testFungibleTokenAddress } from "../../contracts.js";
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
              default: testFungibleTokenAddress,
          });

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
            const client = await connect(command.optsWithGlobals());

            // the input sender, impersonated
            const account =
                from && isAddress(from)
                    ? getAddress(from)
                    : (await client.getAddresses())[0];

            const tokenAddress = await parseTokenAddress(options.token);
            const token = await readErc20Token(client, tokenAddress);

            // get dapp address from local node, or ask
            const application = await getInputApplicationAddress({
                ...command.optsWithGlobals(),
                projectName,
            });

            const { decimals, symbol } = token;
            const amount = amountStr
                ? amountStr
                : await bigintInput({
                      message: `Amount (${symbol})`,
                      decimals,
                  });

            const execLayerData = isHex(options.execLayerData)
                ? options.execLayerData
                : "0x";

            try {
                await depositErc20({
                    amount,
                    application,
                    client,
                    execLayerData,
                    from: account,
                    progress: "default",
                    projectName,
                    token: token.address,
                });
            } catch (e: unknown) {
                reportDepositError(e);
            }
        });
};
