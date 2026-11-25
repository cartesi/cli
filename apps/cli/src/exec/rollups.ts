import {
    type Address,
    type Hash,
    type Hex,
    createPublicClient,
    getAddress,
    hexToBigInt,
    hexToNumber,
    http,
    isAddressEqual,
} from "viem";
import { getMachineHash, getProjectName } from "../base.js";
import type { WithdrawalConfig } from "../config.js";
import { removeStaleEnvironment } from "../host/environment.js";
import { jsonRpc } from "../host/health.js";
import { isRunning, readState, requireState } from "../host/state.js";
import type { ForkConfig } from "../types/chain.js";
import type { AccountsDriveConfig } from "./cartesi-rollups-machine-tool.js";
import { execNodeCommand } from "./node-container.js";

/**
 * Application status as reported by the node. `OK` is healthy and `FAILED` is a
 * recoverable failure; every other value is terminal and the node stops
 * processing inputs for that application, including across restarts.
 */
export type ApplicationStatus =
    | "OK"
    | "FAILED"
    | "DIVERGED"
    | "CORRUPTED"
    | "GUEST_EXCEPTION"
    | "MACHINE_HALTED"
    | "MCYCLE_OVERFLOW"
    | "UNEXPECTED_YIELD"
    | "INVALID_OUTPUTS_ROOT";

/**
 * Statuses in which the node no longer processes inputs for the application.
 */
export const TERMINAL_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
    "DIVERGED",
    "CORRUPTED",
    "GUEST_EXCEPTION",
    "MACHINE_HALTED",
    "MCYCLE_OVERFLOW",
    "UNEXPECTED_YIELD",
    "INVALID_OUTPUTS_ROOT",
];

/**
 * Withdrawal config of an application, as registered in the node
 */
export type NodeWithdrawalConfig = AccountsDriveConfig & {
    guardian: Address;
    withdrawalOutputBuilder: Address;
};

export type RollupsDeployment = {
    name: string;
    address: Address;
    consensus: Address;
    templateHash: Hash;
    epochLength: number;
    status: ApplicationStatus;
    /** Node-provided diagnostic, present when the status is not `OK`. */
    reason?: string;
    enabled: boolean;
    withdrawalConfig?: NodeWithdrawalConfig;
};

type CliWithdrawalConfig = {
    guardian: string;
    log2_leaves_per_account: string;
    log2_max_num_of_accounts: string;
    accounts_drive_start_index: string;
    withdrawal_output_builder: string;
};

type CliRollupsDeployment = {
    name: string;
    iapplication_address: string;
    iconsensus_address: string;
    template_hash: string;
    epoch_length: string;
    status: string;
    reason?: string | null;
    enabled: boolean;
    withdrawal_config?: CliWithdrawalConfig | null;
};

type ComposeParams = {
    projectName: string;
};

const parseWithdrawalConfig = (
    config: CliWithdrawalConfig,
): NodeWithdrawalConfig => ({
    accountsDriveStartIndex: hexToBigInt(
        config.accounts_drive_start_index as Hex,
    ),
    guardian: getAddress(config.guardian),
    log2LeavesPerAccount: hexToBigInt(config.log2_leaves_per_account as Hex),
    log2MaxNumOfAccounts: hexToBigInt(config.log2_max_num_of_accounts as Hex),
    withdrawalOutputBuilder: getAddress(config.withdrawal_output_builder),
});

const parseDeployment = (
    deployment: CliRollupsDeployment,
): RollupsDeployment => ({
    address: deployment.iapplication_address as Address,
    consensus: deployment.iconsensus_address as Address,
    epochLength: hexToNumber(deployment.epoch_length as Hex),
    name: deployment.name,
    status: deployment.status as ApplicationStatus,
    reason: deployment.reason ?? undefined,
    enabled: deployment.enabled,
    templateHash: deployment.template_hash as Hex,
    withdrawalConfig: deployment.withdrawal_config
        ? parseWithdrawalConfig(deployment.withdrawal_config)
        : undefined,
});

/**
 * Parse the JSON `cartesi-rollups-cli app list` writes to stdout. Throws on
 * malformed input; callers decide what that means.
 */
export const parseApplications = (stdout: string): RollupsDeployment[] =>
    (JSON.parse(stdout) as CliRollupsDeployment[]).map(parseDeployment);

export const getDeployments = async (
    options: ComposeParams,
): Promise<RollupsDeployment[]> => {
    try {
        const stdout = await execNodeCommand({
            command: ["cartesi-rollups-cli", "app", "list"],
            projectName: options.projectName,
        });
        return parseApplications(stdout);
    } catch {
        return [];
    }
};

/**
 * Read the withdrawal config of an application registered in the node
 */
export const getNodeWithdrawalConfig = async (options: {
    application: Address;
    projectName: string;
}): Promise<NodeWithdrawalConfig> => {
    const { application, projectName } = options;
    const stdout = await execNodeCommand({
        command: ["cartesi-rollups-cli", "app", "list"],
        projectName,
    });
    const deployment = parseApplications(stdout).find((deployment) =>
        isAddressEqual(deployment.address, application),
    );
    if (!deployment) {
        throw new Error(
            `Application ${application} isn't registered in the node`,
        );
    }
    if (!deployment.withdrawalConfig) {
        throw new Error(
            `The node has no withdrawal config for application ${application}`,
        );
    }
    return deployment.withdrawalConfig;
};

/**
 * Parse the JSON `cartesi-rollups-cli read inputs <application> <index>`
 * writes to stdout
 * @returns the input bytes, as emitted in InputAdded.input
 */
export const parseNodeInput = (stdout: string): Hex =>
    (JSON.parse(stdout) as { data: { raw_data: Hex } }).data.raw_data;

/**
 * Read the bytes of an input from the node database
 */
export const getNodeInput = async (options: {
    application: Address;
    inputIndex: bigint;
    projectName: string;
}): Promise<Hex> => {
    const { application, inputIndex, projectName } = options;
    const stdout = await execNodeCommand({
        command: [
            "cartesi-rollups-cli",
            "read",
            "inputs",
            application,
            inputIndex.toString(),
        ],
        projectName,
    });
    return parseNodeInput(stdout);
};

export type NodeEpoch = {
    index: bigint;
    machineHash?: Hash;
};

/**
 * Parse the JSON `cartesi-rollups-cli read epochs` writes to stdout for a
 * single epoch listed
 * @returns the epoch, or undefined if none is listed
 */
export const parseLastAcceptedEpoch = (
    stdout: string,
): NodeEpoch | undefined => {
    const { data } = JSON.parse(stdout) as {
        data: { index: Hex; machine_hash: Hash | null }[];
    };
    const [epoch] = data;
    return epoch
        ? {
              index: hexToBigInt(epoch.index),
              machineHash: epoch.machine_hash ?? undefined,
          }
        : undefined;
};

/**
 * Read the last epoch of an application whose claim the node saw accepted
 */
export const getLastAcceptedEpoch = async (options: {
    application: Address;
    projectName: string;
}): Promise<NodeEpoch | undefined> => {
    const { application, projectName } = options;
    const stdout = await execNodeCommand({
        command: [
            "cartesi-rollups-cli",
            "read",
            "epochs",
            application,
            "--status",
            "CLAIM_ACCEPTED",
            "--descending",
            "--limit",
            "1",
        ],
        projectName,
    });
    return parseLastAcceptedEpoch(stdout);
};

/**
 * The sentries of an application's DaveConsensus, as `cartesi-rollups-cli
 * contract consensus` reports them.
 */
export type DaveConsensusSentries = {
    address: Address;
    claimStagingPeriod: number;
    sentryManager: Address;
    sentries: { id: number; address: Address }[];
    /** set once a tournament result is staged */
    allSentriesAgree?: boolean;
};

type CliDaveConsensus = {
    type: string;
    address: string;
    claim_staging_period: number;
    sentry_manager: string;
    num_sentries: number;
    sentries: { id: number; address: string }[];
    all_sentries_agree?: boolean;
};

/**
 * Parse the JSON `cartesi-rollups-cli contract consensus --json` writes to
 * stdout for a DaveConsensus
 * @throws if the consensus is of another type
 */
export const parseDaveConsensus = (stdout: string): DaveConsensusSentries => {
    const consensus = JSON.parse(stdout) as CliDaveConsensus;
    if (consensus.type !== "DaveConsensus") {
        throw new Error(
            `The consensus at ${consensus.address} is a ${consensus.type}, not a DaveConsensus`,
        );
    }
    return {
        address: getAddress(consensus.address),
        claimStagingPeriod: consensus.claim_staging_period,
        sentryManager: getAddress(consensus.sentry_manager),
        sentries: consensus.sentries.map(({ id, address }) => ({
            id,
            address: getAddress(address),
        })),
        allSentriesAgree: consensus.all_sentries_agree,
    };
};

/**
 * Read the sentries of an application's DaveConsensus from the chain
 */
export const getDaveConsensus = async (options: {
    application: Address;
    projectName: string;
}): Promise<DaveConsensusSentries> => {
    const { application, projectName } = options;
    const stdout = await execNodeCommand({
        command: [
            "cartesi-rollups-cli",
            "contract",
            "consensus",
            application,
            "--json",
        ],
        projectName,
    });
    return parseDaveConsensus(stdout);
};

export const getApplicationDeployment = async (
    options: ComposeParams,
): Promise<RollupsDeployment | undefined> => {
    const machineHash = await getMachineHash();
    if (!machineHash) {
        return undefined;
    }
    const deployments = await getDeployments(options);
    return deployments.find(
        (deployment) => deployment.templateHash === machineHash,
    );
};

export const getApplicationAddress = async (options: {
    projectName?: string;
}): Promise<Address | undefined> => {
    const projectName = getProjectName(options ?? {});
    const deployment = await getApplicationDeployment({ projectName });
    return deployment?.address;
};

/**
 * Get the fork configuration of anvil node,
 * if it is configured with a forkUrl, it will query the chainId of the fork
 * and return it along with the forkUrl and forkBlockNumber
 * @param options projectName
 * @returns fork configuration of anvil node, or undefined if it is not configured with a forkUrl
 */
export const getForkConfig = async (options: {
    projectName?: string;
}): Promise<ForkConfig | undefined> => {
    const projectName = getProjectName(options ?? {});
    try {
        const nodeInfo = await getAnvilNodeInfo({ projectName });
        const forkUrl = nodeInfo?.forkConfig?.forkUrl;
        const blockNumber = nodeInfo?.forkConfig?.forkBlockNumber;
        if (forkUrl) {
            // if anvil is configured with a forkUrl, connect to it and query the chainId
            const client = createPublicClient({ transport: http(forkUrl) });
            const chainId = await client.getChainId();
            return {
                chainId,
                url: forkUrl,
                blockNumber: blockNumber ? BigInt(blockNumber) : undefined,
            };
        }
    } catch {
        // service may not be running, just return as there is no fork
        return undefined;
    }
    return undefined;
};

export { AVAILABLE_SERVICES, host } from "../host/environment.js";

/**
 * Stop the environment of a project, which the CLI process that started it
 * owns: it gets asked to stop, as a Ctrl+C would, and what is left of it once
 * it exits is removed.
 */
export const stopEnvironment = async (options: { projectName: string }) => {
    const { projectName } = options;
    const state = readState(projectName);
    if (state && isRunning(state) && state.pid !== process.pid) {
        process.kill(state.pid, "SIGTERM");
        const deadline = Date.now() + 30_000;
        while (isRunning(state) && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    }
    await removeStaleEnvironment(projectName);
};

/**
 * Deploy application to rollups node
 * @param options
 * @returns address of the application
 */
export const deployAuthority = async (options: {
    epochLength: number;
    projectName: string;
}): Promise<Address> => {
    const { epochLength, projectName } = options;

    // deploy application
    const stdout = await execNodeCommand({
        command: [
            "cartesi-rollups-cli",
            "deploy",
            "authority",
            "--epoch-length",
            epochLength.toString(),
            "--json",
        ],
        projectName,
    });

    return getAddress(JSON.parse(stdout).address);
};

/**
 * Deploy application to rollups node
 * @param options
 * @returns address of the application
 */
export type DeployApplicationOptions = {
    consensus?: Address;
    epochLength: number;
    name: string;
    projectName: string;
    prt?: boolean;
    salt?: Hex;
    /** PRT only: the sentries appointed on the consensus, in ID order */
    sentries?: Address[];
    /** PRT only: the account that may rotate the sentries */
    sentryManager?: Address;
    snapshotPath: string;
    withdrawalConfig?: WithdrawalConfig;
    claimStagingPeriod: number;
};

/**
 * Assemble the `cartesi-rollups-cli deploy application` arguments.
 * Kept separate from the call so it can be tested without a node.
 */
export const buildDeployApplicationArgs = (
    options: DeployApplicationOptions,
): string[] => {
    const {
        consensus,
        epochLength,
        name,
        prt,
        salt,
        sentries,
        sentryManager,
        snapshotPath,
        withdrawalConfig,
        claimStagingPeriod,
    } = options;

    const deployArgs = [name, snapshotPath];

    // a prt deploy always creates its own DaveConsensus, which is bound to
    // the machine, so an existing consensus is only reused without --prt
    if (consensus && !prt) {
        deployArgs.push("--consensus", consensus);
    } else {
        deployArgs.push("--epoch-length", epochLength.toString());
    }

    if (salt) {
        deployArgs.push("--salt", salt);
    }

    if (prt) {
        deployArgs.push("--prt");
    }

    // the node takes both only with --prt
    if (sentryManager) {
        deployArgs.push("--sentry-manager", sentryManager);
    }
    if (sentries && sentries.length > 0) {
        deployArgs.push("--sentries", sentries.join(","));
    }

    // the node takes this on the whole deploy command, PRT included
    deployArgs.push("--claim-staging-period", claimStagingPeriod.toString());

    if (withdrawalConfig) {
        deployArgs.push(
            "--withdrawal-config",
            JSON.stringify(withdrawalConfig),
        );
    }

    deployArgs.push("--json");

    return deployArgs;
};

export const deployApplication = async (
    options: DeployApplicationOptions,
): Promise<RollupsDeployment> => {
    const { projectName } = options;
    const deployArgs = buildDeployApplicationArgs(options);

    // deploy application
    const stdout = await execNodeCommand({
        command: [
            "cartesi-rollups-cli",
            "deploy",
            "application",
            ...deployArgs,
        ],
        projectName,
    });

    const deployment = stdout ? parseDeployment(JSON.parse(stdout)) : undefined;
    if (deployment) {
        return deployment;
    }
    throw new Error("Failed to deploy application");
};

/**
 * Assemble the `cartesi-rollups-cli app remove` arguments.
 * Kept separate from the call so it can be tested without a node.
 */
export const buildRemoveApplicationArgs = (options: {
    application: string | Address;
    force: boolean;
}): string[] => {
    const { application, force } = options;

    const removeArgs = [application];

    if (force) {
        // the node refuses to remove without acknowledging the work it abandons,
        // and --yes only skips its confirmation prompt
        removeArgs.push("--allow-abandonment", "--yes");
    }

    return removeArgs;
};

/**
 * Remove application from rollups node
 * @param options
 * @returns
 */
export const removeApplication = async (options: {
    application: string | Address;
    force: boolean;
    projectName: string;
}) => {
    const { application, projectName } = options;

    // disable application first so we can remove it
    await execNodeCommand({
        command: [
            "cartesi-rollups-cli",
            "app",
            "status",
            application,
            "disabled",
        ],
        projectName,
    });

    return execNodeCommand({
        command: [
            "cartesi-rollups-cli",
            "app",
            "remove",
            ...buildRemoveApplicationArgs(options),
        ],
        projectName,
    });
};

/**
 * Get the host and port of the entrypoint of the environment of a project
 * @param options
 * @returns host and port of the proxy of the environment
 */
export const getProjectPort = async (options: { projectName: string }) => {
    const state = requireState(options.projectName);
    return `127.0.0.1:${state.port}`;
};

/**
 * Get anvil node info returned by RPC method anvil_nodeInfo
 * @param options
 * @returns anvil node info
 */
export const getAnvilNodeInfo = async (options: { projectName: string }) => {
    const state = requireState(options.projectName);
    return jsonRpc<{
        forkConfig?: { forkUrl?: string; forkBlockNumber?: number };
    }>(state.anvilUrl, "anvil_nodeInfo");
};
