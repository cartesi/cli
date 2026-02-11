import chalk from "chalk";
import { execa } from "execa";
import { Listr, type ListrTask } from "listr2";
import pRetry from "p-retry";
import {
    type Address,
    type Hash,
    type Hex,
    createPublicClient,
    getAddress,
    hexToNumber,
    http,
} from "viem";
import { stringify } from "yaml";
import {
    getContextPath,
    getMachineHash,
    getProjectName,
    getServiceHealth,
} from "../base.js";
import type { ForkConfig } from "../commands/run.js";
import anvil from "../compose/anvil.js";
import { concat } from "../compose/builder.js";
import bundler from "../compose/bundler.js";
import database from "../compose/database.js";
import explorer from "../compose/explorer.js";
import node from "../compose/node.js";
import passkey from "../compose/passkey.js";
import paymaster from "../compose/paymaster.js";
import proxy from "../compose/proxy.js";

export type RollupsDeployment = {
    name: string;
    address: Address;
    consensus: Address;
    templateHash: Hash;
    epochLength: number;
    state: "ENABLED" | "DISABLED";
};

type CliRollupsDeployment = {
    name: string;
    iapplication_address: string;
    iconsensus_address: string;
    template_hash: string;
    epoch_length: string;
    state: string;
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
    state: deployment.state as "ENABLED" | "DISABLED",
    templateHash: deployment.template_hash as Hex,
});

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
        return JSON.parse(stdout).map(parseDeployment);
    } catch {
        return [];
    }
};

export const getApplicationDeployment = async (
    options: ComposeParams,
): Promise<RollupsDeployment | undefined> => {
    const machineHash = getMachineHash();
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
 * Get anvil node configuration and query the chainId of its fork
 * @param options projectName
 * @returns chainId of anvil fork
 */
export const getForkChainId = async (options: {
    projectName?: string;
}): Promise<number | undefined> => {
    const projectName = getProjectName(options ?? {});
    try {
        const nodeInfo = await getAnvilNodeInfo({ projectName });
        const forkUrl = nodeInfo?.forkConfig?.forkUrl;
        if (forkUrl) {
            // if anvil is configured with a forkUrl, connect to it and query the chainId
            const client = createPublicClient({ transport: http(forkUrl) });
            return client.getChainId();
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

const host = "http://127.0.0.1";

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
        healthySemaphore: "explorer_api",
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
                    const health = await getServiceHealth(options);
                    if (health !== "healthy") {
                        throw new Error(
                            errorTitle ??
                                `Service ${chalk.cyan(service)} is not healthy`,
                        );
                    }
                },
                { retries: 100, minTimeout: 500, factor: 1.1 },
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
    dryRun: boolean;
    forkConfig?: ForkConfig;
    memory?: number;
    port: number;
    projectName: string;
    runtimeVersion: string;
    services: string[];
    verbose: boolean;
}) => {
    const {
        blockTime,
        cpus,
        defaultBlock,
        dryRun,
        forkConfig,
        memory,
        port,
        projectName,
        runtimeVersion,
        services,
        verbose,
    } = options;

    const address = `${host}:${port}`;

    // setup the environment variable used in docker compose
    const env: NodeJS.ProcessEnv = {
        CARTESI_BLOCKCHAIN_DEFAULT_BLOCK: defaultBlock,
        CARTESI_LISTEN_PORT: port.toString(),
        CARTESI_LOG_LEVEL: verbose ? "debug" : "info",
    };

    const files = [
        anvil({
            blockTime,
            forkConfig,
            imageTag: runtimeVersion,
        }),
        database({ imageTag: runtimeVersion, password: "password" }),
        node({
            cpus,
            databasePassword: "password",
            defaultBlock,
            forkChainId: forkConfig?.chainId,
            imageTag: runtimeVersion,
            logLevel: verbose ? "debug" : "info",
            memory,
        }),
        proxy({ imageTag: "v3.3.4", port }),
    ];

    if (services.includes("explorer")) {
        files.push(
            explorer({
                imageTag: "1.4.0",
                apiTag: "1.1.0",
                databasePassword: "password",
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
    const upArgs = ["--detach"];

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

        return { address, config };
    }

    // pull images first
    // const pullArgs = ["--policy", "missing"];
    // await execa("docker", [...composeArgs, "pull", ...pullArgs], {
    //     env,
    ////FIXME: stdio and input won't work together
    //     stdio: "inherit",
    //     input: composeFile.build()
    // });

    // run compose
    await execa("docker", [...composeArgs, "up", ...upArgs], {
        env,
        input: stringify(composeFile, { lineWidth: 0, indent: 2 }),
    });

    return { address };
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
export const deployApplication = async (options: {
    consensus?: Address;
    epochLength: number;
    name: string;
    projectName: string;
    prt?: boolean;
    salt?: Hex;
    snapshotPath: string;
}): Promise<RollupsDeployment> => {
    const {
        consensus,
        epochLength,
        name,
        projectName,
        prt,
        salt,
        snapshotPath,
    } = options;

    // app deploy args
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
    deployArgs.push("--json");

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
        removeArgs.push("--force");
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
