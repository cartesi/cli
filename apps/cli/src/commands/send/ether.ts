import { Command } from "@commander-js/extra-typings";
import input from "@inquirer/input";
import ora from "ora";
import { isHex, parseEther } from "viem";
import { etherPortalAbi, etherPortalAddress } from "../../contracts.js";
import {
    type SendCommandOpts,
    connect,
    getInputApplicationAddress,
} from "../send.js";

export const createEtherCommand = () => {
    // biome-ignore lint/complexity/noBannedTypes: command pattern
    return new Command<[], {}, SendCommandOpts>("ether")
        .description(
            "Sends ether deposits to the application, optionally in interactive mode.",
        )
        .configureHelp({ showGlobalOptions: true })
        .option("--amount <number>", "amount, in ETH units")
        .option("--exec-layer-data <hex>", "exec layer data", "0x")
        .action(async (options, command) => {
            const sendOptions = command.optsWithGlobals();

            // connect to RPC provider
            const { publicClient, walletClient } = await connect(sendOptions);

            // get dapp address from local node, or ask
            const applicationAddress = await getInputApplicationAddress(
                sendOptions.dapp,
            );

            const amount =
                options.amount || (await input({ message: "Amount" }));

            const { request } = await publicClient.simulateContract({
                address: etherPortalAddress,
                abi: etherPortalAbi,
                functionName: "depositEther",
                args: [
                    applicationAddress,
                    isHex(options.execLayerData) ? options.execLayerData : "0x", // XXX: validate before this
                ],
                value: parseEther(amount as `${number}`),
                account: walletClient.account,
            });

            const hash = await walletClient.writeContract(request);
            const progress = ora("Sending input...").start();
            await publicClient.waitForTransactionReceipt({ hash });
            progress.succeed(`Input sent: ${hash}`);
        });
};
