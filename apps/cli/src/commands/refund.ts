import type { CartesiPublicClient } from "@cartesi/client";
import {
    Command,
    InvalidArgumentError,
    Option,
} from "@commander-js/extra-typings";
import chalk from "chalk";
import fs from "fs-extra";
import { type Address, type Hex, isHex } from "viem";
import { getProjectName } from "../base.js";
import {
    handleNodeCommandError,
    removeNodePath,
    runNodeCommand,
    transactionArgs,
    writeNodeTempFile,
} from "../exec/node-container.js";
import {
    getNodeClient,
    parseAccountIndex,
    resolveNodeApplication,
} from "../node.js";

/**
 * Commander parser of an input index, in decimal or 0x-prefixed hexadecimal
 */
export const parseInputIndex = (value: string): bigint => {
    if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) {
        throw new InvalidArgumentError("Not a valid input index.");
    }
    return BigInt(value);
};

/**
 * Get the complete InputAdded.input bytes of the deposit to refund, from a
 * file or from the node
 */
export const getInputData = async (options: {
    application: Address;
    client?: Pick<CartesiPublicClient, "getInput">;
    inputFile?: string;
    inputIndex: bigint;
    projectName: string;
}): Promise<Hex> => {
    const { application, inputFile, inputIndex, projectName } = options;

    if (inputFile) {
        const data = (await fs.readFile(inputFile, "utf-8")).trim();
        if (!isHex(data) || data.length <= 2) {
            throw new Error(
                `${inputFile} must contain the 0x-prefixed hexadecimal input bytes`,
            );
        }
        return data;
    }

    const client = options.client ?? (await getNodeClient({ projectName }));
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
    return new Command("refund")
        .description(
            "Refunds a deposit that was not finalized before the application was foreclosed",
        )
        .configureHelp({ showGlobalOptions: true })
        .argument(
            "<input-index>",
            "index of the deposit input",
            parseInputIndex,
        )
        .option("--application <address>", "application address")
        .option(
            "--project-name <string>",
            "name of project (used by docker compose and cartesi-rollups-node)",
        )
        .option(
            "--input-file <path>",
            "file with the 0x-prefixed InputAdded.input bytes (default: read from the node)",
        )
        .addOption(
            new Option(
                "--account-index <index>",
                "index of the account in the node mnemonic paying for gas",
            ).argParser(parseAccountIndex),
        )
        .option("-y, --yes", "skip the confirmation prompt")
        .option("--json", "print the result as JSON")
        .option(
            "--no-wait",
            "return after broadcast without waiting for the receipt",
        )
        .option(
            "--wait-timeout <duration>",
            "maximum time to wait for the receipt (e.g. 30s, 5m)",
        )
        .action(async (inputIndex, options) => {
            const projectName = getProjectName(options);
            const application = await resolveNodeApplication({
                application: options.application,
                projectName,
            });

            const data = await getInputData({
                application,
                inputFile: options.inputFile,
                inputIndex,
                projectName,
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
