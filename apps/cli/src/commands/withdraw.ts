import { Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import fs from "fs-extra";
import ora from "ora";
import pRetry, { type Options as RetryOptions } from "p-retry";
import { type Address, type Hash, zeroHash } from "viem";
import { getProjectName, parseAddress } from "../base.js";
import {
    iApplicationAbi,
    iOutputsMerkleRootValidatorAbi,
} from "../contracts.js";
import {
    execNodeCommand,
    handleNodeCommandError,
    nodePathExists,
    removeNodePath,
    runNodeCommand,
    type TransactionOptions,
    transactionArgs,
    writeNodeTempFile,
} from "../exec/node-container.js";
import {
    type AccountsDriveConfig,
    proveAccountsDrive,
    replayMachine,
} from "../exec/cartesi-rollups-machine-tool.js";
import {
    getLastAcceptedEpoch,
    getNodeWithdrawalConfig,
} from "../exec/rollups.js";
import {
    addRecoveryOptions,
    getAnvilClient,
    resolveNodeApplication,
} from "../node.js";
import { addressInput } from "../prompts.js";

/**
 * Directory inside the rollups node container where replayed machines and
 * proofs are kept, so further withdrawals of the same application reuse them
 */
const WORK_DIR = "/tmp/cartesi-withdraw";

/**
 * Path of the machine replayed up to an epoch. Keyed by application and epoch,
 * so a redeploy or another epoch never reuses a snapshot.
 */
export const replayStorePath = (application: Address, epochIndex: bigint) =>
    `${WORK_DIR}/${application}/epoch-${epochIndex}`;

/**
 * Directory of the proofs generated for an account of an application
 */
export const proofStorePath = (application: Address, account: Address) =>
    `${WORK_DIR}/${application}/${account}`;

/**
 * Operations on the rollups node container used to replay and prove, so tests
 * can run the steps without one
 */
export type WithdrawIo = {
    execNodeCommand: typeof execNodeCommand;
    getLastAcceptedEpoch: typeof getLastAcceptedEpoch;
    nodePathExists: typeof nodePathExists;
    proveAccountsDrive: typeof proveAccountsDrive;
    removeNodePath: typeof removeNodePath;
    replayMachine: typeof replayMachine;
};

const defaultIo: WithdrawIo = {
    execNodeCommand,
    getLastAcceptedEpoch,
    nodePathExists,
    proveAccountsDrive,
    removeNodePath,
    replayMachine,
};

/**
 * How long to wait for the node to process the last finalized epoch
 */
const FINALIZED_EPOCH_RETRY: RetryOptions = {
    retries: 15,
    minTimeout: 1_000,
    maxTimeout: 2_000,
    factor: 1.2,
};

/**
 * Read the foreclosure state of the application from the chain. The node
 * observes it some blocks later, which is too late for a withdrawal that
 * follows another one. The last finalized machine root is the one the proofs
 * are checked against on chain.
 */
const readForeclosureState = async (options: {
    application: Address;
    projectName: string;
}) => {
    const { application, projectName } = options;
    const client = await getAnvilClient({ projectName });
    const [foreclosed, [driveRootProven], validator] = await Promise.all([
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
        client.readContract({
            abi: iApplicationAbi,
            address: application,
            functionName: "getOutputsMerkleRootValidator",
        }),
    ]);
    const finalizedMachineRoot = await client.readContract({
        abi: iOutputsMerkleRootValidatorAbi,
        address: validator,
        args: [application],
        functionName: "getLastFinalizedMachineMerkleRoot",
    });
    return { driveRootProven, finalizedMachineRoot, foreclosed };
};

const isSameHash = (a: Hash, b: Hash) => a.toLowerCase() === b.toLowerCase();

/**
 * Find the epoch the node has with the machine root finalized on chain. The
 * node records accepted epochs some blocks after the chain, so it may still
 * report an older one; nothing is finalized after the foreclosure, so it
 * catches up.
 * @returns the index of the epoch
 */
const waitForFinalizedEpoch = async (options: {
    application: Address;
    finalizedMachineRoot: Hash;
    io: WithdrawIo;
    projectName: string;
    retry: RetryOptions;
}): Promise<bigint> => {
    const { application, finalizedMachineRoot, io, projectName, retry } =
        options;
    let last: { index?: bigint; machineHash?: Hash } = {};
    try {
        return await pRetry(async () => {
            const epoch = await io.getLastAcceptedEpoch({
                application,
                projectName,
            });
            last = epoch ?? {};
            if (
                !epoch?.machineHash ||
                !isSameHash(epoch.machineHash, finalizedMachineRoot)
            ) {
                throw new Error("node is behind the chain");
            }
            return epoch.index;
        }, retry);
    } catch {
        throw new Error(
            `The node hasn't processed the last finalized epoch yet (node epoch ${last.index ?? "none"} root ${last.machineHash ?? "none"}, chain root ${finalizedMachineRoot}); try again shortly`,
        );
    }
};

/**
 * Replay the application up to its last finalized epoch, unless a previous
 * withdrawal already did it. Nothing is finalized after the foreclosure, so
 * the replayed machine never changes.
 * @returns path of the replayed machine inside the rollups node container
 */
export const replayLastFinalizedEpoch = async (options: {
    application: Address;
    finalizedMachineRoot: Hash;
    io?: WithdrawIo;
    projectName: string;
    retry?: RetryOptions;
}): Promise<{ store: string }> => {
    const {
        application,
        finalizedMachineRoot,
        io = defaultIo,
        projectName,
        retry = FINALIZED_EPOCH_RETRY,
    } = options;
    if (isSameHash(finalizedMachineRoot, zeroHash)) {
        throw new Error("No finalized epoch, there are no funds to withdraw");
    }

    const progress = ora("Looking up the last finalized epoch...").start();
    let epochIndex: bigint;
    try {
        epochIndex = await waitForFinalizedEpoch({
            application,
            finalizedMachineRoot,
            io,
            projectName,
            retry,
        });
    } catch (error: unknown) {
        progress.fail();
        throw error;
    }

    const store = replayStorePath(application, epochIndex);
    if (await io.nodePathExists({ path: store, projectName })) {
        progress.succeed(
            `Using the machine replayed up to epoch ${chalk.cyan(epochIndex)}`,
        );
        return { store };
    }

    // replay into a temporary path, so an interrupted replay is never reused
    const tmp = `${store}.tmp`;
    progress.text = `Replaying the inputs up to epoch ${chalk.cyan(epochIndex)}, this may take a while...`;
    try {
        await io.removeNodePath({ path: tmp, projectName });
        const replay = await io.replayMachine({
            application,
            epochIndex,
            projectName,
            store: tmp,
        });
        if (!isSameHash(replay.machineRoot, finalizedMachineRoot)) {
            throw new Error(
                `Replayed machine root ${replay.machineRoot} does not match the finalized machine root ${finalizedMachineRoot} of epoch ${epochIndex}`,
            );
        }
        await io.execNodeCommand({ command: ["mv", tmp, store], projectName });
        progress.succeed(
            `Replayed ${chalk.cyan(replay.processedInputs)} inputs up to epoch ${chalk.cyan(epochIndex)}`,
        );
    } catch (error: unknown) {
        progress.fail("Failed to replay the application");
        await io.removeNodePath({ path: tmp, projectName });
        throw error;
    }
    return { store };
};

/**
 * Generate the accounts drive proofs of an account from the replayed machine,
 * checking they prove the finalized machine root
 * @returns the paths of the proofs inside the rollups node container
 */
export const generateAccountProofs = async (options: {
    account: Address;
    application: Address;
    driveConfig: AccountsDriveConfig;
    io?: WithdrawIo;
    finalizedMachineRoot: Hash;
    projectName: string;
    store: string;
}) => {
    const {
        account,
        application,
        driveConfig,
        finalizedMachineRoot,
        io = defaultIo,
        projectName,
        store,
    } = options;
    const progress = ora(
        `Generating the proofs of ${chalk.cyan(account)}...`,
    ).start();
    const proof = await io
        .proveAccountsDrive({
            account,
            driveConfig,
            outDir: proofStorePath(application, account),
            projectName,
            snapshot: store,
        })
        .catch((error: unknown) => {
            progress.fail(`Failed to generate the proofs of ${account}`);
            throw error;
        });
    if (!isSameHash(proof.machineRoot, finalizedMachineRoot)) {
        progress.fail();
        // a cached snapshot that doesn't prove the finalized root would fail
        // every retry, so drop it and let the next run replay
        await io.removeNodePath({ path: store, projectName });
        throw new Error(
            `Proof machine root ${proof.machineRoot} does not match the finalized machine root ${finalizedMachineRoot}. Removed the cached snapshot; run the command again to replay it`,
        );
    }
    progress.succeed(
        `Generated the proofs of ${chalk.cyan(account)} (account index ${chalk.cyan(proof.accountIndex)})`,
    );
    return proof;
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
    projectName: string;
    tx: TransactionOptions;
}): Promise<string> => {
    const {
        account,
        accountIndex,
        application,
        driveRootProven,
        finalizedMachineRoot,
        projectName,
        tx,
    } = options;
    const driveConfig = await getNodeWithdrawalConfig({
        application,
        projectName,
    });

    const { store } = await replayLastFinalizedEpoch({
        application,
        finalizedMachineRoot,
        projectName,
    });

    const proof = await generateAccountProofs({
        account,
        application,
        driveConfig,
        finalizedMachineRoot,
        projectName,
        store,
    });

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
    return addRecoveryOptions(
        new Command("withdraw")
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
            ),
        "index of the account in the node mnemonic paying for gas",
    ).action(async (options) => {
        const { accountIndex, proofFile } = options;
        const projectName = getProjectName(options);
        const application = await resolveNodeApplication({
            application: options.application,
            projectName,
        });
        const { driveRootProven, finalizedMachineRoot, foreclosed } =
            await readForeclosureState({ application, projectName });
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
                        `The accounts drive root of ${application} isn't proven yet. ${chalk.cyan("--proof-file")} only carries the account proof; run ${chalk.cyan("cartesi withdraw --account <address>")} once so the CLI proves the drive root, then ${chalk.cyan("--proof-file")} will work`,
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
                    driveRootProven,
                    finalizedMachineRoot,
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
