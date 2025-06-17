import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import ora from "ora";
import { formatUnits, getAddress, isAddress, isHex, parseUnits } from "viem";
import { getProjectName } from "../../base.js";
import { etherPortalAbi, etherPortalAddress } from "../../contracts.js";
import { bigintInput, getInputApplicationAddress } from "../../prompts.js";
import { connect } from "../../wallet.js";
import type { DepositCommandOpts } from "../deposit.js";

export const createEtherCommand = () => {
    // biome-ignore lint/complexity/noBannedTypes: commander pattern
    return new Command<[], {}, DepositCommandOpts>("ether")
        .description("Deposit ether to the application")
        .configureHelp({ showGlobalOptions: true })
        .option("--token <address>", "token address")
        .option("--amount <number>", "amount, in ETH units")
        .option("--exec-layer-data <hex>", "exec layer data", "0x")
        .action(async (options, command) => {
            const { from } = command.optsWithGlobals();

            const projectName = getProjectName(command.optsWithGlobals());

            // connect to anvil
            const testClient = await connect(command.optsWithGlobals());

            // the input sender, impersonated
            const account =
                from && isAddress(from)
                    ? getAddress(from)
                    : (await testClient.getAddresses())[0];

            // get dapp address from local node, or ask
            const application = await getInputApplicationAddress({
                ...command.optsWithGlobals(),
                projectName,
            });

            const { decimals, symbol } = testClient.chain.nativeCurrency;
            const amount = options.amount
                ? parseUnits(options.amount, decimals)
                : await bigintInput({
                      message: `Amount (${symbol})`,
                      decimals,
                  });

            const execLayerData = isHex(options.execLayerData)
                ? options.execLayerData
                : "0x";

            // progress spinner
            const progress = ora();

            // for messages
            const amountStr = `${chalk.cyan(formatUnits(amount, decimals))} ${symbol}`;

            // check balance
            const balance = await testClient.getBalance({
                address: account,
            });
            if (balance < amount) {
                progress.fail("Insufficient balance");
                return;
            }

            const { request } = await testClient.simulateContract({
                abi: etherPortalAbi,
                account,
                address: etherPortalAddress,
                args: [application, execLayerData],
                functionName: "depositEther",
                value: amount,
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
