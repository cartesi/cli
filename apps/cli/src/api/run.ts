import chalk from "chalk";
import getPort, { portNumbers } from "get-port";
import ora from "ora";
import {
    type Address,
    createPublicClient,
    type Hex,
    http,
    numberToHex,
} from "viem";
import fs from "node:fs";
import {
    getCartesiEnvironmentVariables,
    getContextPath,
    getMachineHash,
    getProjectName,
} from "../base.js";
import { nodePrtAuthVariables } from "../compose/node.js";
import {
    DEFAULT_SDK_VERSION,
    type DefaultBlock,
    PREFERRED_PORT,
    type RunConfig,
    type WithdrawalConfig,
} from "../config.js";
import {
    deployApplication,
    type EnvironmentOptions,
    host,
    removeApplication,
    type RollupsDeployment,
    startEnvironment,
    startPrtNodes,
    stopEnvironment,
    stopPrtNodes as stopPrtNodeServices,
    waitHealthyEnvironment,
} from "../exec/rollups.js";
import {
    checkPrtNodes,
    describePrtNode,
    describeReference,
    readerModeChanged,
    type ResolvedPrt,
    resolvePrtNodes,
    runnableNodes,
    sentriesOf,
} from "../prt.js";
import type { ForkConfig } from "../types/chain.js";
import { assertForkConfig } from "../validations.js";
import { connect } from "../wallet.js";
import { DEVNET_GUARDIAN, getWithdrawalConfig } from "../withdrawal.js";
import {
    type ConfigOptions,
    listrRenderer,
    type Progress,
    type ProgressOptions,
    resolveConfig,
} from "./types.js";

/**
 * Options of {@link run}. Every option that is not about this particular
 * invocation can also be set in the `run` section of the application
 * configuration, which these take precedence over.
 */
export type RunOptions = ConfigOptions &
    ProgressOptions & {
        /**
         * Interval between blocks, in seconds.
         * @default 2
         */
        blockTime?: number;

        /**
         * Number of blocks between a claim being submitted and accepted
         * (Authority/Quorum only).
         * @default 0
         */
        claimStagingPeriod?: number;

        /** Number of cpu limits for the rollups-node. */
        cpus?: number;

        /**
         * Default block used when fetching new blocks.
         * @default "latest"
         */
        defaultBlock?: DefaultBlock;

        /**
         * Deploy the application built at `.cartesi/image` after the
         * environment is healthy. When there is no machine snapshot the
         * environment is started anyway, and no application is deployed.
         * @default true
         */
        deploy?: boolean;

        /**
         * Run the environment in the background. When disabled, the returned
         * {@link RunResult.cmd} resolves when the environment terminates.
         * @default true
         */
        detach?: boolean;

        /**
         * Do not start the environment, only resolve the docker compose
         * configuration, returned as {@link RunResult.config}.
         * @default false
         */
        dryRun?: boolean;

        /**
         * Length of an epoch, in blocks.
         * @default 720
         */
        epochLength?: number;

        /** Block number to fork from. */
        forkBlockNumber?: number;

        /** RPC URL to fork from. */
        forkUrl?: string;

        /** Memory limit for the rollups-node, in MB. */
        memory?: number;

        /**
         * Port to listen on.
         * @default first free port from 6751
         */
        port?: number;

        /**
         * Name of the project (used by docker compose and cartesi-rollups-node).
         * @default basename of the current working directory
         */
        projectName?: string;

        /**
         * Deploy the application with PRT consensus.
         * @default false
         */
        prt?: boolean;

        /** Version of the Cartesi Rollups Runtime to use. */
        runtimeVersion?: string;

        /**
         * Optional services to start, from {@link AVAILABLE_SERVICES}. The
         * single value `all` starts every optional service.
         * @default []
         */
        services?: string[];

        /**
         * Increase the log level of the environment services.
         * @default true when `progress` is "verbose"
         */
        verbose?: boolean;

        /**
         * Called for configuration that is valid but worth saying out loud,
         * such as a `[prt]` section that has no effect. Nothing is written to
         * the terminal when it is not given.
         */
        onNotice?: (notice: RunNotice) => void;
    };

/** Something worth telling the caller about the configuration of a run. */
export type RunNotice = {
    level: "info" | "warning";
    message: string;
};

export type RunResult = {
    /** Name of the project the environment was started as. */
    projectName: string;

    /** Port the environment is listening on. */
    port: number;

    /** URL of the environment. */
    url: string;

    /** Current deployment of the application, if any. */
    readonly deployment: RollupsDeployment | undefined;

    /** The `[prt]` setup the application was deployed with, if any. */
    readonly prtConfig: ResolvedPrt | undefined;

    /** The PRT node services running for the deployment. */
    readonly prtServices: string[];

    /**
     * Docker compose configuration of the environment. Only defined when the
     * `dryRun` option is enabled, in which case nothing is started.
     */
    config?: string;

    /**
     * Resolves when the environment terminates. Only defined when the `detach`
     * option is disabled.
     */
    cmd?: Promise<unknown>;

    /**
     * Deploy the application currently built at `.cartesi/image`, replacing the
     * previous deployment, if any. Useful to redeploy after a rebuild.
     * @returns the new deployment, or `undefined` if there is no machine snapshot
     */
    deploy(): Promise<RollupsDeployment | undefined>;

    /** Remove the current deployment of the application from the environment. */
    undeploy(): Promise<void>;

    /**
     * Stop the PRT nodes of the deployment. They read the machine a rebuild
     * replaces, so they are stopped before building and started again by
     * {@link RunResult.deploy}.
     */
    stopPrtNodes(): Promise<void>;

    /** Stop the environment, removing its containers and volumes. */
    stop(): Promise<void>;
};

/**
 * Resolve the configuration of an optional anvil fork.
 * @param options fork url and optional block number
 * @returns fork configuration, or `undefined` if no fork url was provided
 */
export const configureFork = async (options: {
    forkUrl?: string;
    forkBlockNumber?: number;
}): Promise<ForkConfig | undefined> => {
    if (!options.forkUrl) {
        return undefined;
    }

    const url = options.forkUrl;

    // create a client to upstream so we can query it
    const client = createPublicClient({
        transport: http(url),
    });

    // use explicit fork-block-number or query from upstream
    const blockNumber = options.forkBlockNumber
        ? BigInt(options.forkBlockNumber)
        : await client.getBlockNumber();

    // need to query fork chainId if forkUrl is specified
    const chainId = await client.getChainId();

    return { blockNumber, chainId, url };
};

const undeployApplication = async (options: {
    progress: Progress;
    projectName: string;
}) => {
    const { progress, projectName } = options;
    const spinner = ora({
        isSilent: progress === "silent",
        text: `${chalk.cyan(projectName)} undeploying...`,
    }).start();
    await removeApplication({
        application: projectName,
        force: true,
        projectName,
    });
    spinner.succeed(`${chalk.cyan(projectName)} undeployed`);
};

/**
 * Report [prt] settings that are valid but have no effect.
 */
const reportPrtWarnings = (options: {
    claimStagingPeriod: number;
    notify: (notice: RunNotice) => void;
    prtConfig?: ResolvedPrt;
}) => {
    const { claimStagingPeriod, notify, prtConfig } = options;
    for (const warning of prtConfig?.warnings ?? []) {
        notify({ level: "warning", message: warning });
    }
    if (
        prtConfig &&
        sentriesOf(prtConfig).length > 0 &&
        claimStagingPeriod === 0
    ) {
        notify({
            level: "warning",
            message:
                "with --claim-staging-period 0 a staged claim is accepted at once, so the sentries have no effect",
        });
    }
};

/**
 * Funds the pool accounts and checks the other PRT nodes have ETH, once anvil
 * is up and before the deploy they claim for.
 */
const fundPrtNodes = async (options: {
    environment: EnvironmentOptions;
    prtConfig?: ResolvedPrt;
}) => {
    const { environment, prtConfig } = options;
    if (!prtConfig || runnableNodes(prtConfig).length === 0) {
        return;
    }
    const client = await connect({
        rpcUrl: `${host}:${environment.port}/anvil`,
    });
    await checkPrtNodes(client, prtConfig);
};

/**
 * Starts the PRT nodes the CLI runs, for the deployed application, then reports
 * the manager and every [prt.nodes] entry in file order: a check for each one
 * running, a note for each one appointed only.
 * @returns the services started
 */
const runPrtNodes = async (options: {
    application: Address;
    environment: EnvironmentOptions;
    progress: Progress;
    prtConfig?: ResolvedPrt;
}): Promise<string[]> => {
    const { application, environment, progress, prtConfig } = options;
    if (
        !prtConfig ||
        (prtConfig.nodes.length === 0 &&
            prtConfig.reference.label === undefined)
    ) {
        return [];
    }

    const nodes = runnableNodes(prtConfig);
    const spinner = ora({ isSilent: progress === "silent" });
    let services: string[] = [];
    if (nodes.length > 0) {
        spinner.start(
            `starting ${nodes.length === 1 ? "the PRT node" : `${nodes.length} PRT nodes`}...`,
        );
        try {
            services = await startPrtNodes({
                ...environment,
                application,
                imageTag: environment.runtimeVersion,
                nodes: prtConfig.nodes,
            });
            spinner.stop();
        } catch (error: unknown) {
            spinner.fail("the PRT nodes failed to start");
            throw error;
        }
    }

    // log-symbols' blue info mark is hard to read on a dark terminal
    const note = (text: string) =>
        spinner.stopAndPersist({ symbol: chalk.cyan("\u2139"), text });
    if (prtConfig.reference.claim) {
        note(describeReference(prtConfig));
    } else {
        spinner.warn(describeReference(prtConfig));
    }
    if (prtConfig.sentryManager === undefined) {
        spinner.warn("sentry manager none (the sentries can't be rotated)");
    } else {
        note(`sentry manager ${prtConfig.sentryManager}`);
    }
    for (const node of prtConfig.nodes) {
        if (node.type === undefined) {
            note(describePrtNode(node));
        } else {
            spinner.succeed(describePrtNode(node));
        }
    }
    return services;
};

const deployMachine = async (options: {
    claimStagingPeriod: number;
    consensus?: Address;
    epochLength: number;
    hash: Hex;
    progress: Progress;
    projectName: string;
    prt?: boolean;
    prtConfig?: ResolvedPrt;
    salt: Hex;
    withdrawalConfig?: WithdrawalConfig;
}) => {
    const {
        claimStagingPeriod,
        consensus,
        epochLength,
        hash,
        progress,
        projectName,
        prt,
        prtConfig,
        salt,
        withdrawalConfig,
    } = options;

    // deploy application to node (onchain and offchain)
    const spinner = ora({
        isSilent: progress === "silent",
        text: `deploying ${chalk.cyan(hash)} as ${chalk.cyan(projectName)}`,
    });

    const application = await deployApplication({
        claimStagingPeriod,
        consensus,
        epochLength,
        name: projectName,
        projectName,
        prt,
        salt,
        sentries:
            prtConfig && sentriesOf(prtConfig).map(({ address }) => address),
        sentryManager: prtConfig?.sentryManager,
        snapshotPath: "/var/lib/cartesi-rollups-node/snapshots/image",
        withdrawalConfig,
    });
    spinner.succeed(
        `${chalk.cyan(projectName)} machine hash is ${chalk.cyan(hash)}`,
    );
    spinner.succeed(
        `${chalk.cyan(projectName)} contract deployed at ${chalk.cyan(application.address)}`,
    );
    return application;
};

/**
 * Layer the three sources of every option of the environment: the options
 * given to {@link run} (which is where the command line options end up), the
 * `run` section of the application configuration, and the defaults.
 *
 * @param options options given to {@link run}
 * @param config `run` section of the application configuration
 * @returns the option values the environment is started with
 */
export const resolveRunOptions = (
    options: RunOptions,
    config: RunConfig = {},
) => ({
    blockTime: options.blockTime ?? config.blockTime ?? 2,
    claimStagingPeriod:
        options.claimStagingPeriod ?? config.claimStagingPeriod ?? 0,
    cpus: options.cpus ?? config.cpus,
    defaultBlock: options.defaultBlock ?? config.defaultBlock ?? "latest",
    epochLength: options.epochLength ?? config.epochLength ?? 720,
    forkBlockNumber: options.forkBlockNumber ?? config.forkBlockNumber,
    forkUrl: options.forkUrl ?? config.forkUrl,
    memory: options.memory ?? config.memory,
    // a port of zero is not a port, so the first free one is resolved later
    port: options.port || config.port,
    projectName: options.projectName ?? config.projectName,
    prt: options.prt ?? config.prt ?? false,
    runtimeVersion:
        options.runtimeVersion ?? config.runtimeVersion ?? DEFAULT_SDK_VERSION,
    services: options.services ?? config.services ?? [],
    verbose:
        options.verbose ?? config.verbose ?? options.progress === "verbose",
});

/**
 * Run a local Cartesi node for the application, and deploy to it the machine
 * snapshot built at `.cartesi/image`, if there is one.
 *
 * The environment keeps running in the background until
 * {@link RunResult.stop} is called.
 *
 * @param options run options
 * @returns a handle of the running environment
 */
export const run = async (options: RunOptions = {}): Promise<RunResult> => {
    const {
        deploy: deployOnStart = true,
        detach = true,
        dryRun = false,
        progress = "silent",
    } = options;

    const notify = options.onNotice ?? (() => {});

    // get application configuration (e.g. use withdrawal config if present)
    const applicationConfig = await resolveConfig(options.config, "run");

    // the 'run' section of the configuration defines project level defaults,
    // which the options given to this function always take precedence over
    const {
        blockTime,
        claimStagingPeriod,
        cpus,
        defaultBlock,
        epochLength,
        memory,
        prt,
        runtimeVersion,
        services,
        verbose,
        ...resolved
    } = resolveRunOptions(options, applicationConfig.run);

    // project name explicitly defined, defined by the configuration, or the
    // current directory name
    const projectName = getProjectName(resolved);

    if (defaultBlock !== "finalized" && progress !== "silent") {
        console.warn(
            chalk.yellow(
                `WARNING: default block is set to '${defaultBlock}', production configuration will likely use 'finalized'`,
            ),
        );
    }

    // resolve port number, using the first free port in a range, unless explicitly set
    const port =
        resolved.port ||
        (await getPort({
            port: portNumbers(PREFERRED_PORT, PREFERRED_PORT + 10),
        }));

    // host address
    const url = `${host}:${port}`;

    // configure optional anvil fork
    const forkConfig = await configureFork(resolved);

    if (forkConfig) {
        await assertForkConfig(forkConfig, { includePRT: prt });
    }

    // emergency withdrawal configuration, derived from the accounts drive of the built
    // machine. The configuration is resolved again, as a rebuild may have changed it.
    const imagePath = getContextPath("image");
    const resolveWithdrawalConfig = async () =>
        getWithdrawalConfig(
            await resolveConfig(options.config, "run"),
            imagePath,
            { fork: forkConfig !== undefined },
        );

    // fail before starting the environment if it can't be derived
    if (fs.existsSync(imagePath)) {
        await resolveWithdrawalConfig();
    }

    // [prt] is parsed either way, so a mistake in it fails early, but the node
    // takes sentries only on a PRT deploy. Resolved again on a rebuild, like
    // the withdrawal configuration.
    const resolvePrt = async () => {
        const config = await resolveConfig(options.config, "run");
        return prt && config.prt
            ? resolvePrtNodes(config.prt, {
                  guardian: config.withdrawal?.guardian ?? DEVNET_GUARDIAN,
              })
            : undefined;
    };
    if (applicationConfig.prt && !prt) {
        notify({
            level: "info",
            message: "the 'prt' configuration is ignored without --prt",
        });
    }

    // fail before starting the environment if [prt] can't be resolved
    let prtConfig = await resolvePrt();
    reportPrtWarnings({ claimStagingPeriod, notify, prtConfig });

    // in reader mode the node has no PRT signer
    const claimSubmission = prtConfig?.reference.claim ?? true;
    if (!claimSubmission) {
        const hostVars = getCartesiEnvironmentVariables();
        const prtAuth = nodePrtAuthVariables.filter(
            (name) => hostVars[name] !== undefined,
        );
        if (prtAuth.length > 0) {
            notify({
                level: "warning",
                message: `${prtAuth.join(", ")} ${prtAuth.length === 1 ? "is" : "are"} set, but [prt.nodes.${prtConfig?.reference.label}] has claim = false, so the rollups-node runs in reader mode with no PRT signer and the value is dropped`,
            });
        }
    }

    const environment: EnvironmentOptions = {
        blockTime,
        claimSubmission,
        cpus,
        defaultBlock,
        forkConfig,
        memory,
        port,
        projectName,
        prt,
        runtimeVersion,
        services,
        verbose,
    };

    // run compose environment
    const { cmd, config } = await startEnvironment({
        ...environment,
        detach,
        dryRun,
    });

    let deployment: RollupsDeployment | undefined;
    let prtServices: string[] = [];
    let salt = 0;

    const stopPrtNodes = async () => {
        await stopPrtNodeServices({ projectName, services: prtServices });
        prtServices = [];
    };

    const stop = async () => {
        await stopEnvironment({ projectName });
        prtServices = [];
    };

    const undeploy = async () => {
        if (deployment) {
            await undeployApplication({ progress, projectName });
            deployment = undefined;
        }
    };

    const deploy = async () => {
        const machineHash = await getMachineHash({
            sdk: applicationConfig.sdk,
        });
        if (!machineHash) {
            return undefined;
        }

        // the PRT nodes read the machine a rebuild replaces, and claim for the
        // application this redeploy removes
        await stopPrtNodes();

        // the accounts drive may have moved with a rebuild, resolved before
        // undeploying in case it is now invalid
        const withdrawalConfig = await resolveWithdrawalConfig();

        // a PRT redeploy creates a new consensus, with the sentries as they are
        // in the config now. The node's mode can't change: it is fixed in its
        // database
        const resolved = await resolvePrt();
        const moved = readerModeChanged(prtConfig, resolved);
        if (moved !== undefined) {
            notify({ level: "warning", message: moved });
        } else {
            prtConfig = resolved;
        }
        reportPrtWarnings({ claimStagingPeriod, notify, prtConfig });
        await fundPrtNodes({ environment, prtConfig });

        // keep the consensus of the previous deployment, if there is one; a
        // PRT deploy ignores it and creates a new one
        const consensus = deployment?.consensus;
        await undeploy();

        deployment = await deployMachine({
            claimStagingPeriod,
            consensus,
            epochLength,
            hash: machineHash,
            progress,
            projectName,
            prt,
            prtConfig,
            salt: numberToHex(salt++, { size: 32 }),
            withdrawalConfig,
        });
        prtServices = await runPrtNodes({
            application: deployment.address,
            environment,
            progress,
            prtConfig,
        });
        return deployment;
    };

    const result: RunResult = {
        get deployment() {
            return deployment;
        },
        get prtConfig() {
            return prtConfig;
        },
        get prtServices() {
            return prtServices;
        },
        cmd,
        config,
        deploy,
        port,
        projectName,
        stop,
        stopPrtNodes,
        undeploy,
        url,
    };

    if (dryRun) {
        // environment was not started, just return the compose configuration
        return result;
    }

    ora({ isSilent: progress === "silent" }).succeed(
        `${chalk.cyan(projectName)} starting at ${chalk.cyan(url)}`,
    );

    // wait for the environment to be healthy
    await waitHealthyEnvironment({
        name: projectName,
        port,
        projectName,
        renderer: listrRenderer(progress),
        services,
    });

    // deploy the application built at .cartesi/image, if there is one
    if (deployOnStart) {
        await deploy();
    }

    return result;
};
