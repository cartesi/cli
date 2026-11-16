import { getProjectName } from "../base.js";
import { removeNodePath, writeNodeTempFile } from "../exec/node-container.js";
import { resolveNodeApplication } from "../node.js";
import { getInputData } from "../refund.js";
import {
    type RecoveryOptions,
    type RecoveryResult,
    runRecoveryCommand,
} from "./recovery.js";

export type RefundOptions = RecoveryOptions & {
    /** Index of the deposit input to refund. */
    inputIndex: bigint;

    /**
     * File with the 0x-prefixed InputAdded.input bytes of the deposit.
     * @default read from the node
     */
    inputFile?: string;
};

/**
 * Refund a deposit that was not finalized before the application was
 * foreclosed. The gas is paid by the account `accountIndex` of the node
 * mnemonic.
 * @param options refund options
 * @returns the application, and the output of cartesi-rollups-cli
 */
export const refund = async (
    options: RefundOptions,
): Promise<RecoveryResult> => {
    const { inputFile, inputIndex, stream = false } = options;
    const projectName = getProjectName(options);
    const application = await resolveNodeApplication({
        application: options.application,
        projectName,
    });

    const data = await getInputData({
        application,
        inputFile,
        inputIndex,
        projectName,
    });

    // the node tool reads the input bytes from a file in its container
    const path = await writeNodeTempFile({
        content: `${data}\n`,
        projectName,
    });
    try {
        const output = await runRecoveryCommand({
            accountIndex: options.accountIndex,
            command: [
                "cartesi-rollups-cli",
                "refund",
                application,
                inputIndex.toString(),
                "--input-file",
                path,
            ],
            projectName,
            stream,
            tx: options,
        });
        return { application, output };
    } finally {
        await removeNodePath({ path, projectName });
    }
};
