import type { CartesiPublicClient } from "@cartesi/client";
import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import fs from "fs-extra";
import { type Address, type Hex, isHex } from "viem";
import { getProjectName, parseInputIndex } from "../base.js";
import {
    handleNodeCommandError,
    removeNodePath,
    runNodeCommand,
    transactionArgs,
    writeNodeTempFile,
} from "../exec/node-container.js";
import {
    getNodeClient,
    addRecoveryOptions,
    resolveNodeApplication,
} from "../node.js";

/**
 * Get the complete InputAdded.input bytes of the deposit to refund, from a
 * file or from the node
 */
export const getInputData = async (options: {
    application: Address;
    client: Pick<CartesiPublicClient, "getInput">;
    inputFile?: string;
    inputIndex: bigint;
}): Promise<Hex> => {
    const { application, client, inputFile, inputIndex } = options;

    if (inputFile) {
        const data = (await fs.readFile(inputFile, "utf-8")).trim();
        if (!isHex(data) || data.length <= 2) {
            throw new Error(
                `${inputFile} must contain the 0x-prefixed hexadecimal input bytes`,
            );
        }
        return data;
    }

    try {
        const input = await client.getInput({ application, inputIndex });
        return input.rawData;
    } catch (error: unknown) {
        throw new Error(
            `Input ${inputIndex} not found in the node, use ${chalk.cyan("--input-file")} with the InputAdded.input bytes`,
            { cause: error },
        );
    }
};

export const createRefundCommand = () => {
    return addRecoveryOptions(
        new Command("refund")
            .description(
                "Refunds a deposit that was not finalized before the application was foreclosed",
            )
            .configureHelp({ showGlobalOptions: true })
            .argument(
                "<input-index>",
                "index of the deposit input",
                parseInputIndex,
            )
            .option(
                "--input-file <path>",
                "file with the 0x-prefixed InputAdded.input bytes (default: read from the node)",
            ),
        "index of the account in the node mnemonic paying for gas",
    ).action(async (inputIndex, options) => {
        const projectName = getProjectName(options);
        const application = await resolveNodeApplication({
            application: options.application,
            projectName,
        });

        const data = await getInputData({
            application,
            client: await getNodeClient({ projectName }),
            inputFile: options.inputFile,
            inputIndex,
        });

        // the node tool reads the input bytes from a file in its container
        const path = await writeNodeTempFile({
            content: `${data}\n`,
            projectName,
        });
        try {
            await runNodeCommand({
                accountIndex: options.accountIndex,
                command: [
                    "cartesi-rollups-cli",
                    "refund",
                    application,
                    inputIndex.toString(),
                    "--input-file",
                    path,
                    ...transactionArgs(options),
                ],
                projectName,
            });
        } catch (error: unknown) {
            handleNodeCommandError(error);
        } finally {
            await removeNodePath({ path, projectName });
        }
    });
};
