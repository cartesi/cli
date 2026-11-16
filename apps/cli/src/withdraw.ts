import chalk from "chalk";
import ora from "ora";
import pRetry, { type Options as RetryOptions } from "p-retry";
import { type Address, type Hash, zeroHash } from "viem";
import type { Progress } from "./api/types.js";
import {
    iApplicationAbi,
    iOutputsMerkleRootValidatorAbi,
} from "./contracts.js";
import {
    type AccountsDriveConfig,
    proveAccountsDrive,
    replayMachine,
} from "./exec/cartesi-rollups-machine-tool.js";
import {
    execNodeCommand,
    nodePathExists,
    removeNodePath,
} from "./exec/node-container.js";
import { getLastAcceptedEpoch } from "./exec/rollups.js";
import { getAnvilClient } from "./node.js";

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
export const readForeclosureState = async (options: {
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

/**
 * Read the foreclosure state of the application, which must be foreclosed for
 * its funds to be withdrawn
 * @throws when the application is not foreclosed
 */
export const assertForeclosed = async (options: {
    application: Address;
    projectName: string;
}) => {
    const state = await readForeclosureState(options);
    if (!state.foreclosed) {
        throw new Error(
            `Application ${chalk.cyan(options.application)} is not foreclosed, use ${chalk.cyan("cartesi foreclose")} first`,
        );
    }
    return state;
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
    progress?: Progress;
    projectName: string;
    retry?: RetryOptions;
}): Promise<{ store: string }> => {
    const {
        application,
        finalizedMachineRoot,
        io = defaultIo,
        progress: verbosity = "silent",
        projectName,
        retry = FINALIZED_EPOCH_RETRY,
    } = options;
    if (isSameHash(finalizedMachineRoot, zeroHash)) {
        throw new Error("No finalized epoch, there are no funds to withdraw");
    }

    const progress = ora({
        isSilent: verbosity === "silent",
        text: "Looking up the last finalized epoch...",
    }).start();
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
    progress?: Progress;
    projectName: string;
    store: string;
}) => {
    const {
        account,
        application,
        driveConfig,
        finalizedMachineRoot,
        io = defaultIo,
        progress: verbosity = "silent",
        projectName,
        store,
    } = options;
    const progress = ora({
        isSilent: verbosity === "silent",
        text: `Generating the proofs of ${chalk.cyan(account)}...`,
    }).start();
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
