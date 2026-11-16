import chalk from "chalk";
import fs from "fs-extra";
import { type Address, getAddress, type Hash } from "viem";
import { getProjectName } from "../base.js";
import {
    execNodeCommand,
    removeNodePath,
    runAttachedNodeCommand,
    type TransactionOptions,
    transactionArgs,
    writeNodeTempFile,
} from "../exec/node-container.js";
import { getNodeWithdrawalConfig } from "../exec/rollups.js";
import { resolveNodeApplication } from "../node.js";
import {
    assertForeclosed,
    generateAccountProofs,
    replayLastFinalizedEpoch,
} from "../withdraw.js";
import {
    type RecoveryOptions,
    type RecoveryResult,
    runRecoveryCommand,
} from "./recovery.js";
import type { Progress } from "./types.js";

export type WithdrawOptions = RecoveryOptions & {
    /**
     * Account to withdraw the funds of, whose proofs are generated from the
     * application replayed up to its last finalized epoch. Either this or
     * `proofFile` is required.
     */
    account?: Address;

    /**
     * Withdraw proof generated elsewhere, instead of generating it. Either this
     * or `account` is required.
     */
    proofFile?: string;
};

/**
 * Generate the proofs of an account and prove the accounts drive root, if
 * nobody did it yet
 * @returns path of the withdraw proof inside the rollups node container
 */
const proveAccount = async (options: {
    account: Address;
    accountIndex?: number;
    application: Address;
    driveRootProven: boolean;
    finalizedMachineRoot: Hash;
    progress: Progress;
    projectName: string;
    stream: boolean;
    tx: TransactionOptions;
}): Promise<string> => {
    const {
        account,
        accountIndex,
        application,
        driveRootProven,
        finalizedMachineRoot,
        progress,
        projectName,
        stream,
        tx,
    } = options;
    const driveConfig = await getNodeWithdrawalConfig({
        application,
        projectName,
    });

    const { store } = await replayLastFinalizedEpoch({
        application,
        finalizedMachineRoot,
        progress,
        projectName,
    });

    const proof = await generateAccountProofs({
        account,
        application,
        driveConfig,
        finalizedMachineRoot,
        progress,
        projectName,
        store,
    });

    if (!driveRootProven) {
        // the withdrawal depends on it, so always wait for the receipt
        const command = [
            "cartesi-rollups-cli",
            "prove-drive-root",
            application,
            "--proof-file",
            proof.driveRootProofFile,
        ];
        if (stream) {
            // keep stdout for the output of the withdrawal
            await runAttachedNodeCommand({
                accountIndex,
                command: [
                    ...command,
                    ...transactionArgs({ ...tx, json: false, wait: true }),
                ],
                projectName,
                stdout: "stderr",
            });
        } else {
            await execNodeCommand({
                accountIndex,
                command: [
                    ...command,
                    ...transactionArgs({
                        ...tx,
                        json: false,
                        wait: true,
                        yes: true,
                    }),
                ],
                projectName,
            });
        }
    }

    return proof.withdrawProofFile;
};

/**
 * Withdraw the funds of an account from a foreclosed application. The gas is
 * paid by the account `accountIndex` of the node mnemonic. The application is
 * replayed and the proofs are generated in the rollups node container, unless
 * a `proofFile` is given; replays and proofs are kept there, for the next
 * withdrawals to reuse.
 * @param options withdraw options
 * @returns the application, and the output of cartesi-rollups-cli
 */
export const withdraw = async (
    options: WithdrawOptions,
): Promise<RecoveryResult> => {
    const {
        accountIndex,
        proofFile,
        progress = "silent",
        stream = false,
    } = options;
    if (options.account && proofFile) {
        throw new Error("Define either account or proofFile, not both");
    }
    if (!options.account && !proofFile) {
        throw new Error(
            "Define the account to withdraw the funds of, or a proofFile",
        );
    }

    const projectName = getProjectName(options);
    const application = await resolveNodeApplication({
        application: options.application,
        projectName,
    });
    const { driveRootProven, finalizedMachineRoot } = await assertForeclosed({
        application,
        projectName,
    });

    let withdrawProofFile: string;
    let tmpProofFile: string | undefined;
    try {
        if (proofFile) {
            if (!driveRootProven) {
                throw new Error(
                    `The accounts drive root of ${application} isn't proven yet. ${chalk.cyan("--proof-file")} only carries the account proof; run ${chalk.cyan("cartesi withdraw --account <address>")} once so the CLI proves the drive root, then ${chalk.cyan("--proof-file")} will work`,
                );
            }
            tmpProofFile = await writeNodeTempFile({
                content: await fs.readFile(proofFile, "utf-8"),
                projectName,
            });
            withdrawProofFile = tmpProofFile;
        } else {
            withdrawProofFile = await proveAccount({
                // checksummed, as it names the directory of its cached proofs
                account: getAddress(options.account as Address),
                accountIndex,
                application,
                driveRootProven,
                finalizedMachineRoot,
                progress,
                projectName,
                stream,
                tx: options,
            });
        }

        const output = await runRecoveryCommand({
            accountIndex,
            command: [
                "cartesi-rollups-cli",
                "withdraw",
                application,
                "--proof-file",
                withdrawProofFile,
            ],
            projectName,
            stream,
            tx: options,
        });
        return { application, output };
    } finally {
        if (tmpProofFile) {
            await removeNodePath({ path: tmpProofFile, projectName });
        }
    }
};
