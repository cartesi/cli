import { Command, Option } from "@commander-js/extra-typings";
import ora from "ora";
import { getAddress, isAddress } from "viem";
import { encodeInput, send } from "../api/send.js";
import { getProjectName } from "../base.js";
import { bytesInput, getInputApplicationAddress } from "../prompts.js";
import { connect } from "../wallet.js";

export const createSendCommand = () => {
    const command = new Command("send")
        .description("Send input to the application")
        .argument("[input]", "input payload")
        .option("--from <address>", "input sender address")
        .option("--application <address>", "application address")
        .addOption(
            new Option("--encoding <encoding>", "input encoding").choices([
                "hex",
                "string",
                "abi",
                "abi-packed",
            ]),
        )
        .option("--abi-params <abi-params>", "input abi params")
        .option(
            "--project-name <string>",
            "name of project (used by docker compose and cartesi-rollups-node)",
        )
        .option("--rpc-url <url>", "RPC URL of the Cartesi Devnet")
        .action(async (input, options) => {
            const { application, from } = options;

            const projectName = getProjectName(options);

            // connect to anvil, so we can ask which account to impersonate
            const testClient = await connect(options);

            // the input sender, impersonated
            const account =
                from && isAddress(from)
                    ? getAddress(from)
                    : (await testClient.getAddresses())[0];

            // get dapp address from local node, or ask
            const applicationAddress = await getInputApplicationAddress({
                application,
                projectName,
            });

            const payload =
                (await encodeInput(input, options)) ||
                (await bytesInput({
                    abiParams: options.abiParams,
                    encoding: options.encoding,
                    message: "Input",
                }));

            const progress = ora("Sending input...").start();
            const { transactionHash } = await send({
                application: applicationAddress,
                client: testClient,
                from: account,
                payload,
                projectName,
            });
            progress.succeed(`Input sent: ${transactionHash}`);
        });
    return command;
};
