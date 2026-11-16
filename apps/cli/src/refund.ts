import chalk from "chalk";
import fs from "fs-extra";
import { type Address, type Hex, isHex } from "viem";
import { getNodeInput } from "./exec/rollups.js";

/**
 * Get the complete InputAdded.input bytes of the deposit to refund, from a
 * file or from the node
 */
export const getInputData = async (options: {
    application: Address;
    inputFile?: string;
    inputIndex: bigint;
    io?: { getNodeInput: typeof getNodeInput };
    projectName: string;
}): Promise<Hex> => {
    const {
        application,
        inputFile,
        inputIndex,
        io = { getNodeInput },
        projectName,
    } = options;

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
        return await io.getNodeInput({ application, inputIndex, projectName });
    } catch (error: unknown) {
        throw new Error(
            `Input ${inputIndex} not found in the node, use ${chalk.cyan("--input-file")} with the InputAdded.input bytes`,
            { cause: error },
        );
    }
};
