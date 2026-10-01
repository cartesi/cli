import type { CartesiPublicClient } from "@cartesi/client";
import { Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import fs from "fs-extra";
import ora from "ora";
import type { Address, Hash } from "viem";
import { getProjectName, parseAddress } from "../base.js";
import { iApplicationAbi } from "../contracts.js";
import {
    execNodeCommand,
    handleNodeCommandError,
    nodePathExists,
    proveAccountsDrive,
    removeNodePath,
    replayMachine,
    runNodeCommand,
    type TransactionOptions,
    transactionArgs,
    writeNodeTempFile,
} from "../exec/rollups.js";
import {
    getNodeClient,
    parseAccountIndex,
    resolveNodeApplication,
} from "../node.js";
import { addressInput } from "../prompts.js";
import { connect } from "../wallet.js";

/**
 * Directory inside the rollups node container where replayed machines and
 * proofs are kept, so further withdrawals of the same application reuse them
 */
const WORK_DIR = "/tmp/cartesi-withdraw";

/**
 * Read the foreclosure state of the application from the chain. The node
 * observes it some blocks later, which is too late for a withdrawal that
 * follows another one.
 */
const readForeclosureState = async (options: {
    application: Address;
    projectName: string;
}) => {
    const { application, projectName } = options;
    const client = await connect({ projectName });
    const [foreclosed, [driveRootProven]] = await Promise.all([
        client.readContract({
            abi: iApplicationAbi,
            address: application,
            functionName: "isForeclosed",
        }),
        client.readContract({
            abi: iApplicationAbi,
            address: application,
            functionName: "getAccountsDriveMerkleRoot",
        }),
    ]);
    return { driveRootProven, foreclosed };
};

const isSameHash = (a: Hash, b: Hash) => a.toLowerCase() === b.toLowerCase();

/**
 * Replay the application up to its last finalized epoch, unless a previous
 * withdrawal already did it. Nothing is finalized after the foreclosure, so
 * the replayed machine never changes.
 * @returns path of the replayed machine inside the rollups node container
 */
const replayLastFinalizedEpoch = async (options: {
    application: Address;
    client: CartesiPublicClient;
    projectName: string;
}): Promise<{ machineHash: Hash; store: string }> => {
    const { application, client, projectName } = options;
    const progress = ora("Looking up the last finalized epoch...").start();

    let epochIndex: bigint;
    try {
        epochIndex = await client.getLastAcceptedEpochIndex({ application });
    } catch (error: unknown) {
        progress.fail("No finalized epoch, there are no funds to withdraw");
        throw error;
    }
    const { machineHash } = await client.getEpoch({ application, epochIndex });
    if (!machineHash) {
        progress.fail();
        throw new Error(`Epoch ${epochIndex} has no machine hash`);
    }

    const store = `${WORK_DIR}/${application}/epoch-${epochIndex}`;
    if (await nodePathExists({ path: store, projectName })) {
        progress.succeed(
            `Using the machine replayed up to epoch ${chalk.cyan(epochIndex)}`,
        );
        return { machineHash, store };
    }

    // replay into a temporary path, so an interrupted replay is never reused
    const tmp = `${store}.tmp`;
    progress.text = `Replaying the inputs up to epoch ${chalk.cyan(epochIndex)}, this may take a while...`;
    try {
        await removeNodePath({ path: tmp, projectName });
        const replay = await replayMachine({
            application,
            epochIndex,
            projectName,
            store: tmp,
        });
        if (!isSameHash(replay.machineRoot, machineHash)) {
            throw new Error(
                `Replayed machine root ${replay.machineRoot} does not match the machine hash ${machineHash} of epoch ${epochIndex}`,
            );
        }
        await execNodeCommand({ command: ["mv", tmp, store], projectName });
        progress.succeed(
            `Replayed ${chalk.cyan(replay.processedInputs)} inputs up to epoch ${chalk.cyan(epochIndex)}`,
        );
    } catch (error: unknown) {
        progress.fail("Failed to replay the application");
        await removeNodePath({ path: tmp, projectName });
        throw error;
    }
    return { machineHash, store };
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
    client: CartesiPublicClient;
    driveRootProven: boolean;
    projectName: string;
    tx: TransactionOptions;
}): Promise<string> => {
    const {
        account,
        accountIndex,
        application,
        client,
        driveRootProven,
        projectName,
        tx,
    } = options;
    const { withdrawalConfig } = await client.getApplication({
        application,
    });

    const { machineHash, store } = await replayLastFinalizedEpoch({
        application,
        client,
        projectName,
    });

    const progress = ora(
        `Generating the proofs of ${chalk.cyan(account)}...`,
    ).start();
    const proof = await proveAccountsDrive({
        account,
        driveConfig: withdrawalConfig,
        outDir: `${WORK_DIR}/${application}/${account}`,
        projectName,
        snapshot: store,
    }).catch((error: unknown) => {
        progress.fail(`Failed to generate the proofs of ${account}`);
        throw error;
    });
    if (!isSameHash(proof.machineRoot, machineHash)) {
        progress.fail();
        throw new Error(
            `Proof machine root ${proof.machineRoot} does not match the finalized machine hash ${machineHash}`,
        );
    }
    progress.succeed(
        `Generated the proofs of ${chalk.cyan(account)} (account index ${chalk.cyan(proof.accountIndex)})`,
    );

    if (!driveRootProven) {
        // the withdrawal depends on it, so always wait for the receipt, and
        // keep stdout for the output of the withdrawal
        await runNodeCommand({
            accountIndex,
            command: [
                "cartesi-rollups-cli",
                "prove-drive-root",
                application,
                "--proof-file",
                proof.driveRootProofFile,
                ...transactionArgs({ ...tx, json: false, wait: true }),
            ],
            projectName,
            stdout: "stderr",
        });
    }

    return proof.withdrawProofFile;
};

export const createWithdrawCommand = () => {
    return new Command("withdraw")
        .description(
            "Withdraws the funds of an account from a foreclosed application",
        )
        .configureHelp({ showGlobalOptions: true })
        .addOption(
            new Option(
                "--account <address>",
                "account to withdraw the funds of",
            ).argParser(parseAddress),
        )
        .addOption(
            new Option(
                "--proof-file <path>",
                "withdraw proof generated elsewhere, instead of generating it",
            ).conflicts("account"),
        )
        .option("--application <address>", "application address")
        .option(
            "--project-name <string>",
            "name of project (used by docker compose and cartesi-rollups-node)",
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
        .action(async (options) => {
            const { accountIndex, proofFile } = options;
            const projectName = getProjectName(options);
            const application = await resolveNodeApplication({
                application: options.application,
                projectName,
            });
            const client = await getNodeClient({ projectName });

            const { driveRootProven, foreclosed } = await readForeclosureState({
                application,
                projectName,
            });
            if (!foreclosed) {
                throw new Error(
                    `Application ${chalk.cyan(application)} is not foreclosed, use ${chalk.cyan("cartesi foreclose")} first`,
                );
            }

            let withdrawProofFile: string;
            let tmpProofFile: string | undefined;
            try {
                if (proofFile) {
                    if (!driveRootProven) {
                        throw new Error(
                            `The accounts drive root of ${application} is not proven yet, use ${chalk.cyan("--account")} so it can be proven`,
                        );
                    }
                    tmpProofFile = await writeNodeTempFile({
                        content: await fs.readFile(proofFile, "utf-8"),
                        projectName,
                    });
                    withdrawProofFile = tmpProofFile;
                } else {
                    const account =
                        options.account ??
                        (await addressInput({
                            message: "Account to withdraw the funds of",
                        }));
                    withdrawProofFile = await proveAccount({
                        account,
                        accountIndex,
                        application,
                        client,
                        driveRootProven,
                        projectName,
                        tx: options,
                    });
                }

                await runNodeCommand({
                    accountIndex,
                    command: [
                        "cartesi-rollups-cli",
                        "withdraw",
                        application,
                        "--proof-file",
                        withdrawProofFile,
                        ...transactionArgs(options),
                    ],
                    projectName,
                });
            } catch (error: unknown) {
                handleNodeCommandError(error);
            } finally {
                if (tmpProofFile) {
                    await removeNodePath({ path: tmpProofFile, projectName });
                }
            }
        });
};
