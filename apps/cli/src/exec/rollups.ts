import chalk from "chalk";
import { execa } from "execa";
import { Listr, type ListrTask } from "listr2";
import pRetry, { AbortError } from "p-retry";
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
import { stringify } from "yaml";
import {
    getCartesiEnvironmentVariables,
    getContextPath,
    getMachineHash,
    getProjectName,
    getServiceInfo,
} from "../base.js";
import anvil from "../compose/anvil.js";
import { concat } from "../compose/builder.js";
import bundler from "../compose/bundler.js";
import database from "../compose/database.js";
import explorer from "../compose/explorer.js";
import node from "../compose/node.js";
import passkey from "../compose/passkey.js";
import paymaster from "../compose/paymaster.js";
import proxy from "../compose/proxy.js";
import type { WithdrawalConfig } from "../config.js";
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

type Service = {
    name: string; // name of the service
    healthySemaphore?: string; // service to check if the service is healthy
    healthyTitle?: string | ((port: number, name?: string) => string); // title of the service when it is healthy
    waitTitle?: string; // title of the service when it is starting
    errorTitle?: string; // title of the service when it is not healthy
};

export const host = "http://127.0.0.1";

/**
 * Upper bound for the delay between health checks. Without it the 1.1 growth
 * factor reaches a 104 minute sleep by the last of the 100 attempts, so a
 * service that never becomes healthy would hold the command for 19 hours.
 */
const SERVICE_HEALTH_MAX_INTERVAL = 5_000;

// services configuration
const baseServices: Service[] = [
    {
        name: "anvil",
        healthySemaphore: "anvil",
        healthyTitle: (port) =>
            `${chalk.cyan("anvil")} service ready at ${chalk.cyan(`${host}:${port}/anvil`)}`,
        waitTitle: `${chalk.cyan("anvil")} service starting...`,
        errorTitle: `${chalk.red("anvil")} service failed`,
    },
    {
        name: "proxy",
    },
    {
        name: "database",
    },
    {
        name: "rpc",
        healthySemaphore: "rollups_node",
        healthyTitle: (port) =>
            `${chalk.cyan("rpc")} service ready at ${chalk.cyan(`${host}:${port}/rpc`)}`,
        waitTitle: `${chalk.cyan("rpc")} service starting...`,
        errorTitle: `${chalk.red("rpc")} service failed`,
    },
    {
        name: "inspect",
        healthySemaphore: "rollups_node",
        healthyTitle: (port, name) =>
            `${chalk.cyan("inspect")} service ready at ${chalk.cyan(`${host}:${port}/inspect/${name ?? "<application_address>"}`)}`,
        waitTitle: `${chalk.cyan("inspect")} service starting...`,
        errorTitle: `${chalk.red("inspect")} service failed`,
    },
];

const availableServices: Service[] = [
    {
        name: "bundler",
        healthySemaphore: "bundler",
        healthyTitle: (port) =>
            `${chalk.cyan("bundler")} service ready at ${chalk.cyan(`${host}:${port}/bundler/rpc`)}`,
        waitTitle: `${chalk.cyan("bundler")} service starting...`,
        errorTitle: `${chalk.red("bundler")} service failed`,
    },
    {
        name: "explorer",
        healthySemaphore: "explorer",
        healthyTitle: (port) =>
            `${chalk.cyan("explorer")} service ready at ${chalk.cyan(`${host}:${port}/explorer`)}`,
        waitTitle: `${chalk.cyan("explorer")} service starting...`,
        errorTitle: `${chalk.red("explorer")} service failed`,
    },
    {
        name: "paymaster",
        healthySemaphore: "paymaster",
        healthyTitle: (port) =>
            `${chalk.cyan("paymaster")} service ready at ${chalk.cyan(`${host}:${port}/paymaster`)}`,
        waitTitle: `${chalk.cyan("paymaster")} service starting...`,
        errorTitle: `${chalk.red("paymaster")} service failed`,
    },
    {
        name: "passkey",
        healthySemaphore: "passkey_server",
        healthyTitle: (port) =>
            `${chalk.cyan("passkey")} service ready at ${chalk.cyan(`${host}:${port}/passkey`)}`,
        waitTitle: `${chalk.cyan("passkey")} service starting...`,
        errorTitle: `${chalk.red("passkey")} service failed`,
    },
];

export const AVAILABLE_SERVICES = availableServices.map(({ name }) => name);

const serviceMonitorTask = (options: {
    projectName: string;
    errorTitle?: string;
    healthyTitle?: string;
    service: string;
    waitTitle?: string;
}): ListrTask => {
    const { errorTitle, healthyTitle, service, waitTitle } = options;

    return {
        task: async (_ctx, task) => {
            await pRetry(
                async () => {
                    const info = await getServiceInfo(options);

                    // An exited container never becomes healthy, so stop
                    // retrying instead of spending the whole budget on it.
                    if (info?.State === "exited" || info?.State === "dead") {
                        throw new AbortError(
                            errorTitle ??
                                `Service ${chalk.cyan(service)} exited`,
                        );
                    }

                    if (info?.Health !== "healthy") {
                        throw new Error(
                            errorTitle ??
                                `Service ${chalk.cyan(service)} is not healthy`,
                        );
                    }
                },
                {
                    retries: 100,
                    minTimeout: 500,
                    maxTimeout: SERVICE_HEALTH_MAX_INTERVAL,
                    factor: 1.1,
                },
            );
            task.title =
                healthyTitle ?? `Service ${chalk.cyan(service)} is ready`;
        },
        title: waitTitle ?? `Starting ${chalk.cyan(service)}...`,
    };
};

export const startEnvironment = async (options: {
    blockTime: number;
    cpus?: number;
    defaultBlock: "latest" | "safe" | "pending" | "finalized";
    detach: boolean;
    dryRun: boolean;
    forkConfig?: ForkConfig;
    memory?: number;
    port: number;
    projectName: string;
    prt?: boolean;
    runtimeVersion: string;
    services: string[];
    verbose: boolean;
}) => {
    const {
        blockTime,
        cpus,
        defaultBlock,
        detach,
        dryRun,
        forkConfig,
        memory,
        port,
        projectName,
        prt,
        runtimeVersion,
        services,
        verbose,
    } = options;

    // setup the environment variable used in docker compose
    const env: NodeJS.ProcessEnv = {
        CARTESI_BLOCKCHAIN_DEFAULT_BLOCK: defaultBlock,
        CARTESI_LISTEN_PORT: port.toString(),
        CARTESI_LOG_LEVEL: verbose ? "debug" : "info",
    };

    // local dev environment, we don't need security
    const databasePassword = "password";

    // Load all environment variables from the host that start with CARTESI_.
    const hostVars = getCartesiEnvironmentVariables();

    const files = [
        anvil({
            blockTime,
            forkConfig,
            imageTag: runtimeVersion,
        }),
        database({ imageTag: runtimeVersion, password: databasePassword }),
        node({
            cpus,
            databasePassword,
            defaultBlock,
            forkChainId: forkConfig?.chainId,
            imageTag: runtimeVersion,
            logLevel: verbose ? "debug" : "info",
            memory,
            prt,
            cartesiEnvironmentVariables: hostVars,
        }),
        proxy({ imageTag: "v3.3.4", port }),
    ];

    if (services.includes("explorer")) {
        files.push(
            explorer({
                imageTag: "2.0.0-alpha.4",
                port,
            }),
        );
    }
    if (services.includes("bundler")) {
        files.push(bundler({ imageTag: runtimeVersion }));
    }
    if (services.includes("paymaster")) {
        files.push(paymaster({ imageTag: runtimeVersion }));
    }
    if (services.includes("passkey")) {
        files.push(passkey({ imageTag: runtimeVersion }));
    }

    const composeArgs = ["compose", "-f", "-", "--project-directory", "."];

    // run in detached mode (background)
    const upArgs = detach ? ["--detach"] : [];

    // merge files, following Docker Compose merge rules
    const composeFile = concat([{ name: projectName }, ...files]);

    // if only dry run, just return the config
    if (dryRun) {
        // parse, resolve and render compose file in canonical format
        const { stdout: config } = await execa(
            "docker",
            [...composeArgs, "config", "--format", "yaml"],
            { env, input: stringify(composeFile, { lineWidth: 0, indent: 2 }) },
        );

        return { config };
    }

    // run compose
    const cmd = execa("docker", [...composeArgs, "up", ...upArgs], {
        env,
        input: stringify(composeFile, { lineWidth: 0, indent: 2 }),
    });

    // if detached, wait to finish
    if (detach) {
        await cmd;
    }

    return { cmd };
};

/**
 * Wait for the environment to be healthy
 * @param options
 */
export const waitHealthyEnvironment = async (options: {
    name?: string;
    port: number;
    projectName: string;
    services: string[];
}) => {
    const { name, port, projectName, services } = options;

    // select subset of optional services
    const optionalServices =
        services.length === 1 && services[0] === "all"
            ? availableServices
            : availableServices.filter(({ name }) => services.includes(name));

    // create tasks to monitor services startup
    const monitorTasks = [...baseServices, ...optionalServices]
        .filter(({ healthySemaphore }) => !!healthySemaphore) // only services with a healthy semaphore
        .map((service) => {
            const healthyTitle =
                typeof service.healthyTitle === "function"
                    ? service.healthyTitle(port, name)
                    : service.healthyTitle;
            return serviceMonitorTask({
                projectName,
                service: service.healthySemaphore as string,
                errorTitle: service.errorTitle,
                waitTitle: service.waitTitle,
                healthyTitle,
            });
        });

    const tasks = new Listr(monitorTasks, { concurrent: true });
    await tasks.run();
};

/**
 * Publish machine snapshot to rollups node by copying it to the rollups node container
 * @param options
 * @returns path to the snapshot in the rollups node
 */
export const publishMachine = async (options: {
    projectName: string;
    templateHash: Hash;
}): Promise<string> => {
    const { projectName, templateHash } = options;
    const snapshotPath = getContextPath("image");
    const containerSnapshotPath = `/var/lib/cartesi-rollups-node/snapshots/${templateHash}/`;
    await execa("docker", [
        "compose",
        "--project-name",
        projectName,
        "cp",
        snapshotPath,
        `rollups_node:${containerSnapshotPath}`,
    ]);
    return containerSnapshotPath;
};

/**
 * Stop an environment by removing the containers and volumes
 * @param options
 * @returns
 */
export const stopEnvironment = async (options: { projectName: string }) => {
    const { projectName } = options;
    return execa("docker", [
        "compose",
        "--project-name",
        projectName,
        "down",
        "--volumes",
    ]);
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
    snapshotPath: string;
    withdrawalConfig?: WithdrawalConfig;
    claimStagingPeriod: number;
};

/**
 * Serialise the withdrawal config for `--withdrawal-config`. JSON.stringify can't encode a
 * bigint, and the node decodes the start index as a uint64 number, so bigints are written as
 * bare number literals to keep every digit.
 */
export const stringifyWithdrawalConfig = (config: WithdrawalConfig): string => {
    const fields = Object.entries(config).map(
        ([key, value]) =>
            `${JSON.stringify(key)}:${typeof value === "bigint" ? value.toString() : JSON.stringify(value)}`,
    );
    return `{${fields.join(",")}}`;
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
        snapshotPath,
        withdrawalConfig,
        claimStagingPeriod,
    } = options;

    const deployArgs = [name, snapshotPath];

    if (consensus) {
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

    // the node takes this on the whole deploy command, PRT included
    deployArgs.push("--claim-staging-period", claimStagingPeriod.toString());

    if (withdrawalConfig) {
        deployArgs.push(
            "--withdrawal-config",
            stringifyWithdrawalConfig(withdrawalConfig),
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
 * Remove application from rollups node
 * @param options
 * @returns
 */
export const removeApplication = async (options: {
    application: string | Address;
    force: boolean;
    projectName: string;
}) => {
    const { application, force, projectName } = options;

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

    const removeArgs = [application];

    if (force) {
        removeArgs.push("--yes");
    }

    return execNodeCommand({
        command: ["cartesi-rollups-cli", "app", "remove", ...removeArgs],
        projectName,
    });
};

/**
 * Get the host and port of the docker compose project entrypoint
 * @param options
 * @returns port of the proxy service
 */
export const getProjectPort = async (options: { projectName: string }) => {
    const { projectName } = options;
    const { stdout } = await execa("docker", [
        "compose",
        "--project-name",
        projectName,
        "port",
        "proxy",
        "8088",
    ]);
    return stdout;
};

/**
 * Get anvil node info returned by RPC method anvil_nodeInfo
 * @param options
 * @returns anvil node info
 */
export const getAnvilNodeInfo = async (options: { projectName: string }) => {
    const { projectName } = options;
    const stdout = await execNodeCommand({
        command: ["cast", "rpc", "anvil_nodeInfo"],
        projectName,
        service: "anvil",
    });
    return JSON.parse(stdout);
};
