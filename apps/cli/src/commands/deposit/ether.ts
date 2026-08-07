import { Command } from "@commander-js/extra-typings";
import { getAddress, isAddress, isHex } from "viem";
import { depositEther } from "../../api/deposit/ether.js";
import { getProjectName } from "../../base.js";
import { bigintInput, getInputApplicationAddress } from "../../prompts.js";
import { connect } from "../../wallet.js";
import type { DepositCommandOpts } from "../deposit.js";
import { reportDepositError } from "./error.js";

export const createEtherCommand = () => {
    return new Command<[], Record<string, never>, DepositCommandOpts>("ether")
        .description("Deposit ether to the application")
        .configureHelp({ showGlobalOptions: true })
        .argument("[amount]", "amount, in ETH units")
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

            // get dapp address from local node, or ask
            const application = await getInputApplicationAddress({
                ...command.optsWithGlobals(),
                projectName,
            });

            const { decimals, symbol } = client.chain.nativeCurrency;
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
                await depositEther({
                    amount,
                    application,
                    client,
                    execLayerData,
                    from: account,
                    progress: "default",
                    projectName,
                });
            } catch (e: unknown) {
                reportDepositError(e);
            }
        });
};
