import chalk from "chalk";
import { ExecaError, execa } from "execa";
import { dirname } from "node:path/posix";
import { Listr, type ListrTask } from "listr2";
import pRetry, { AbortError } from "p-retry";
import {
    type Address,
    type Hash,
    type Hex,
    createPublicClient,
    getAddress,
    hexToNumber,
    http,
    isHash,
    toHex,
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
};

type ComposeParams = {
    projectName: string;
};

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
        const { stdout } = await execa("docker", [
            "compose",
            "--project-name",
            options.projectName,
            "exec",
            "rollups_node",
            "cartesi-rollups-cli",
            "app",
            "list",
        ]);
        return parseApplications(stdout);
    } catch {
        return [];
    }
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
                imageTag: "2.0.0-alpha.3",
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
    const { stdout } = await execa("docker", [
        "compose",
        "--project-name",
        projectName,
        "exec",
        "rollups_node",
        "cartesi-rollups-cli",
        "deploy",
        "authority",
        "--epoch-length",
        epochLength.toString(),
        "--json",
    ]);

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
    const { stdout } = await execa("docker", [
        "compose",
        "--project-name",
        projectName,
        "exec",
        "rollups_node",
        "cartesi-rollups-cli",
        "deploy",
        "application",
        ...deployArgs,
    ]);

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
    await execa("docker", [
        "compose",
        "--project-name",
        projectName,
        "exec",
        "rollups_node",
        "cartesi-rollups-cli",
        "app",
        "status",
        application,
        "disabled",
    ]);

    const removeArgs = [application];

    if (force) {
        removeArgs.push("--yes");
    }

    return execa("docker", [
        "compose",
        "--project-name",
        projectName,
        "exec",
        "rollups_node",
        "cartesi-rollups-cli",
        "app",
        "remove",
        ...removeArgs,
    ]);
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
    const { stdout } = await execa("docker", [
        "compose",
        "--project-name",
        projectName,
        "exec",
        "anvil",
        "cast",
        "rpc",
        "anvil_nodeInfo",
    ]);
    return JSON.parse(stdout);
};

/**
 * Path of the machine template inside the rollups node container, as
 * published by `cartesi run`
 */
export const NODE_TEMPLATE_PATH =
    "/var/lib/cartesi-rollups-node/snapshots/image";

/**
 * Transaction options shared by the cartesi-rollups-cli commands that send a
 * transaction. Each one is forwarded only when set.
 */
export type TransactionOptions = {
    json?: boolean;
    wait?: boolean;
    waitTimeout?: string;
    yes?: boolean;
};

export const transactionArgs = (options: TransactionOptions): string[] => {
    const { json, wait, waitTimeout, yes } = options;
    const args: string[] = [];
    if (yes) {
        args.push("--yes");
    }
    if (json) {
        args.push("--json");
    }
    if (wait === false) {
        args.push("--no-wait");
    }
    if (waitTimeout) {
        args.push("--wait-timeout", waitTimeout);
    }
    return args;
};

/**
 * Build the docker arguments to run a command inside the rollups node
 * container. Without a terminal attached docker cannot allocate a TTY, so it
 * must be disabled.
 */
export const nodeExecArgs = (options: {
    accountIndex?: number;
    command: string[];
    env?: Record<string, string>;
    interactive: boolean;
    projectName: string;
    workdir?: string;
}): string[] => {
    const { accountIndex, command, env, interactive, projectName, workdir } =
        options;
    const args = ["compose", "--project-name", projectName, "exec"];
    if (!interactive) {
        args.push("-T");
    }
    // only the names: docker takes the values from its own environment, so
    // secrets never show up in the process arguments
    for (const name of Object.keys(env ?? {})) {
        args.push("-e", name);
    }
    if (accountIndex !== undefined) {
        args.push("-e", `CARTESI_AUTH_MNEMONIC_ACCOUNT_INDEX=${accountIndex}`);
    }
    if (workdir) {
        args.push("--workdir", workdir);
    }
    return [...args, "rollups_node", ...command];
};

/**
 * Run a command inside the rollups node container with the terminal attached,
 * so its prompts and output reach the user directly. Its output can be sent to
 * stderr to keep stdout for the output of a later command.
 */
export const runNodeCommand = (options: {
    accountIndex?: number;
    command: string[];
    env?: Record<string, string>;
    projectName: string;
    stdout?: "stdout" | "stderr";
}) =>
    execa(
        "docker",
        nodeExecArgs({ ...options, interactive: !!process.stdin.isTTY }),
        {
            env: options.env,
            stdin: "inherit",
            stdout: options.stdout === "stderr" ? 2 : "inherit",
            stderr: "inherit",
        },
    );

/**
 * Run a command inside the rollups node container and capture its output
 * @returns stdout of the command
 */
export const execNodeCommand = async (options: {
    command: string[];
    input?: string;
    projectName: string;
    workdir?: string;
}): Promise<string> => {
    const { input, ...rest } = options;
    try {
        const { stdout } = await execa(
            "docker",
            nodeExecArgs({ ...rest, interactive: false }),
            { input },
        );
        return stdout;
    } catch (error: unknown) {
        if (error instanceof ExecaError) {
            throw new Error(
                String(error.stderr ?? "").trim() || error.shortMessage,
            );
        }
        throw error;
    }
};

/**
 * Write content to a fresh temporary file inside the rollups node container,
 * so the node tools can read it
 * @returns path of the file inside the container
 */
export const writeNodeTempFile = async (options: {
    content: string;
    projectName: string;
}): Promise<string> => {
    const { content, projectName } = options;
    const stdout = await execNodeCommand({
        command: ["sh", "-c", 'f=$(mktemp) && cat > "$f" && echo "$f"'],
        input: content,
        projectName,
    });
    return stdout.trim();
};

/**
 * Remove a file or directory from the rollups node container
 */
export const removeNodePath = (options: {
    path: string;
    projectName: string;
}) =>
    execNodeCommand({
        command: ["rm", "-rf", options.path],
        projectName: options.projectName,
    });

/**
 * Check whether a path exists inside the rollups node container
 */
export const nodePathExists = async (options: {
    path: string;
    projectName: string;
}): Promise<boolean> => {
    const { exitCode } = await execa(
        "docker",
        nodeExecArgs({
            command: ["test", "-e", options.path],
            interactive: false,
            projectName: options.projectName,
        }),
        { reject: false },
    );
    return exitCode === 0;
};

/**
 * Report the failure of a command run with the terminal attached. The command
 * already printed its error, so only its exit code is propagated.
 */
export const handleNodeCommandError = (error: unknown) => {
    if (error instanceof ExecaError) {
        process.exitCode = error.exitCode ?? 1;
        return;
    }
    throw error;
};

/**
 * Signer the rollups node container is configured with. Private keys are never
 * read out of the container, only their kind.
 */
export type NodeSigner =
    | { kind: "mnemonic"; mnemonic: string }
    | { kind: "private_key" };

/**
 * Print the signer kind and, for mnemonic signers, the mnemonic itself, the
 * same way cartesi-rollups-cli resolves them: an inline mnemonic takes
 * precedence over the one in CARTESI_AUTH_MNEMONIC_FILE.
 */
export const NODE_SIGNER_SCRIPT = `kind="\${CARTESI_AUTH_KIND:-mnemonic}"
printf '%s\\n' "$kind"
case "$kind" in
mnemonic|mnemonic_file)
    if [ -n "$CARTESI_AUTH_MNEMONIC" ]; then
        printf '%s\\n' "$CARTESI_AUTH_MNEMONIC"
    elif [ -n "$CARTESI_AUTH_MNEMONIC_FILE" ]; then
        cat "$CARTESI_AUTH_MNEMONIC_FILE"
    fi
    ;;
esac`;

/**
 * Parse the output of the node signer script
 */
export const parseNodeSigner = (stdout: string): NodeSigner => {
    const [kind = "", ...rest] = stdout.trim().split("\n");
    switch (kind.trim()) {
        case "mnemonic":
        case "mnemonic_file": {
            const mnemonic = rest.join(" ").trim();
            if (!mnemonic) {
                throw new Error("The rollups node has no mnemonic configured");
            }
            return { kind: "mnemonic", mnemonic };
        }
        case "private_key":
        case "private_key_file":
            return { kind: "private_key" };
        default:
            throw new Error(
                `Signer kind ${kind.trim()} of the rollups node isn't supported by the CLI`,
            );
    }
};

/**
 * Read the signer the rollups node container is configured with, which is
 * the one cartesi-rollups-cli signs with unless a command overrides it
 */
export const getNodeSigner = async (options: {
    projectName: string;
}): Promise<NodeSigner> => {
    const stdout = await execNodeCommand({
        command: ["sh", "-c", NODE_SIGNER_SCRIPT],
        projectName: options.projectName,
    });
    return parseNodeSigner(stdout);
};

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
