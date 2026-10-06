import { dirname } from "node:path/posix";
import { type Address, type Hash, isHash, toHex } from "viem";
import { execNodeCommand } from "./node-container.js";

/**
 * Path of the machine template inside the rollups node container, as
 * published by `cartesi run`
 */
export const NODE_TEMPLATE_PATH =
    "/var/lib/cartesi-rollups-node/snapshots/image";

/**
 * Layout of the accounts drive, as configured in the application contract
 */
export type AccountsDriveConfig = {
    accountsDriveStartIndex: bigint;
    log2LeavesPerAccount: bigint;
    log2MaxNumOfAccounts: bigint;
};

export const replayArgs = (options: {
    application: Address;
    epochIndex: bigint;
    store: string;
}): string[] => [
    "cartesi-rollups-machine-tool",
    "replay",
    "--template",
    NODE_TEMPLATE_PATH,
    "--application",
    options.application,
    "--to-epoch",
    options.epochIndex.toString(),
    "--store",
    options.store,
];

export const proveAccountsDriveArgs = (options: {
    account: Address;
    driveConfig: AccountsDriveConfig;
    outDir: string;
    snapshot: string;
}): string[] => {
    const { account, driveConfig, outDir, snapshot } = options;
    return [
        "cartesi-rollups-machine-tool",
        "prove",
        "accounts-drive",
        "--snapshot",
        snapshot,
        "--accounts-drive-start-index",
        toHex(driveConfig.accountsDriveStartIndex),
        "--log2-max-num-of-accounts",
        toHex(driveConfig.log2MaxNumOfAccounts),
        "--log2-leaves-per-account",
        toHex(driveConfig.log2LeavesPerAccount),
        "--account",
        account,
        "--out-drive-root-proof",
        `${outDir}/drive-root-proof.json`,
        "--out-withdraw-proof",
        `${outDir}/withdraw-proof.json`,
    ];
};

export type ReplaySummary = {
    machineRoot: Hash;
    processedInputs: number;
    store: string;
};

export type ProveSummary = {
    accountIndex: bigint;
    accountsDriveMerkleRoot: Hash;
    driveRootProofFile: string;
    machineRoot: Hash;
    withdrawProofFile: string;
};

/**
 * The machine tool prints a single JSON object as its last line of output
 */
const parseSummary = (stdout: string): Record<string, unknown> => {
    const line = stdout.trim().split("\n").pop() ?? "";
    const summary = JSON.parse(line);
    if (typeof summary !== "object" || summary === null) {
        throw new Error(`Unexpected machine tool output: ${stdout}`);
    }
    return summary;
};

const requireHash = (summary: Record<string, unknown>, key: string): Hash => {
    const value = summary[key];
    if (typeof value !== "string" || !isHash(value)) {
        throw new Error(`Invalid ${key} in machine tool output: ${value}`);
    }
    return value;
};

const requireString = (
    summary: Record<string, unknown>,
    key: string,
): string => {
    const value = summary[key];
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Missing ${key} in machine tool output`);
    }
    return value;
};

export const parseReplaySummary = (stdout: string): ReplaySummary => {
    const summary = parseSummary(stdout);
    const processedInputs = summary.processed_inputs;
    if (typeof processedInputs !== "number") {
        throw new Error("Missing processed_inputs in machine tool output");
    }
    return {
        machineRoot: requireHash(summary, "machine_root"),
        processedInputs,
        store: requireString(summary, "store"),
    };
};

export const parseProveSummary = (stdout: string): ProveSummary => {
    const summary = parseSummary(stdout);
    return {
        accountIndex: BigInt(requireString(summary, "account_index")),
        accountsDriveMerkleRoot: requireHash(
            summary,
            "accounts_drive_merkle_root",
        ),
        driveRootProofFile: requireString(summary, "drive_root_proof_file"),
        machineRoot: requireHash(summary, "machine_root"),
        withdrawProofFile: requireString(summary, "withdraw_proof_file"),
    };
};

/**
 * Replay the accepted inputs of an application up to an epoch, storing the
 * resulting machine inside the rollups node container. The machine writes the
 * reports of the inputs to its working directory, which must be writable.
 */
export const replayMachine = async (options: {
    application: Address;
    epochIndex: bigint;
    projectName: string;
    store: string;
}): Promise<ReplaySummary> => {
    const { projectName, store } = options;
    const workdir = dirname(store);
    await execNodeCommand({ command: ["mkdir", "-p", workdir], projectName });
    const stdout = await execNodeCommand({
        command: replayArgs(options),
        projectName,
        workdir,
    });
    return parseReplaySummary(stdout);
};

/**
 * Generate the accounts drive root proof and the withdraw proof of an account
 * from a stored machine inside the rollups node container
 */
export const proveAccountsDrive = async (options: {
    account: Address;
    driveConfig: AccountsDriveConfig;
    outDir: string;
    projectName: string;
    snapshot: string;
}): Promise<ProveSummary> => {
    const { outDir, projectName } = options;
    await execNodeCommand({ command: ["mkdir", "-p", outDir], projectName });
    const stdout = await execNodeCommand({
        command: proveAccountsDriveArgs(options),
        projectName,
        workdir: outDir,
    });
    return parseProveSummary(stdout);
};
