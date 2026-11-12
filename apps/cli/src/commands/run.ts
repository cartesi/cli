import {
    Command,
    type CommandUnknownOpts,
    Option,
} from "@commander-js/extra-typings";
import { AbortPromptError, ExitPromptError } from "@inquirer/core";
import chalk from "chalk";
import { ExecaError } from "execa";
import getPort, { portNumbers } from "get-port";
import fs from "node:fs";
import ora from "ora";
import {
    type Address,
    createPublicClient,
    type Hex,
    http,
    numberToHex,
} from "viem";
import {
    getApplicationConfig,
    getCartesiEnvironmentVariables,
    getContextPath,
    getMachineHash,
    getProjectName,
} from "../base.js";
import {
    nodeAllowedEnvironmentVariables,
    nodePrtAuthVariables,
} from "../compose/node.js";
import {
    DEFAULT_SDK_VERSION,
    PREFERRED_PORT,
    type WithdrawalConfig,
} from "../config.js";
import {
    AVAILABLE_SERVICES,
    deployApplication,
    type EnvironmentOptions,
    host,
    removeApplication,
    getDeployments,
    type RollupsDeployment,
    startEnvironment,
    startPrtNodes,
    stopEnvironment,
    stopPrtNodes,
    TERMINAL_APPLICATION_STATUSES,
    waitHealthyEnvironment,
} from "../exec/rollups.js";
import { keySelect } from "../prompts.js";
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

const commaSeparatedList = (value: string) => value.split(",");

/** How often the interactive shell re-reads the application status. */
const STATUS_POLL_INTERVAL = 5_000;

/**
 * Report an application that is no longer in the `OK` state. The node stops
 * processing inputs on a terminal status while still accepting them on-chain,
 * so without this the application goes quiet with no indication why.
 */
const reportApplicationStatus = (deployment: RollupsDeployment) => {
    const terminal = TERMINAL_APPLICATION_STATUSES.includes(deployment.status);
    const paint = terminal ? chalk.red : chalk.yellow;

    console.warn(
        paint(
            terminal
                ? `application ${deployment.name} is ${deployment.status} and stopped processing inputs`
                : `application ${deployment.name} is ${deployment.status}`,
        ),
    );

    if (deployment.reason) {
        console.warn(paint(`reason: ${deployment.reason}`));
    }

    console.warn(
        chalk.yellow(
            `run ${chalk.cyan("cartesi logs")} for details, or rebuild to deploy a new application`,
        ),
    );
};

const shell = async (options: {
    build?: CommandUnknownOpts;
    deployment?: RollupsDeployment;
    environment: EnvironmentOptions;
    epochLength: number;
    log?: CommandUnknownOpts;
    projectName: string;
    prt?: boolean;
    salt: number;
    sdk: string;
    /** the PRT node services running for the deployment */
    prtServices: string[];
    /** the [prt] setup the environment started with */
    prtConfig?: ResolvedPrt;
    resolveWithdrawalConfig: () => WithdrawalConfig | undefined;
    resolvePrt: () => ResolvedPrt | undefined;
    claimStagingPeriod: number;
}) => {
    const {
        build,
        environment,
        epochLength,
        log,
        projectName,
        prt,
        sdk,
        resolveWithdrawalConfig,
        resolvePrt,
        claimStagingPeriod,
    } = options;

    let lastDeployment = options.deployment;
    let salt = options.salt;
    let prtServices = options.prtServices;
    let lastStatus = lastDeployment?.status;
    let pendingReport: RollupsDeployment | undefined;

    /**
     * Re-read the deployed application and remember it when its status changed.
     * The prompt owns the terminal while it is open, so nothing is printed from
     * here -- the caller aborts the prompt and reports once it has closed.
     */
    const pollStatus = async (abort: () => void) => {
        const address = lastDeployment?.address;
        if (!address) {
            return;
        }

        const deployments = await getDeployments({ projectName });
        const deployment = deployments.find((d) => d.address === address);
        if (!deployment || deployment.status === lastStatus) {
            return;
        }

        lastStatus = deployment.status;
        if (deployment.status !== "OK") {
            pendingReport = deployment;
            abort();
        }
    };

    while (true) {
        if (pendingReport) {
            reportApplicationStatus(pendingReport);
            pendingReport = undefined;
        }

        const controller = new AbortController();
        const watcher = setInterval(() => {
            pollStatus(() => controller.abort()).catch(() => {
                // a transient docker failure should not interrupt the session
            });
        }, STATUS_POLL_INTERVAL);

        try {
            const option = await keySelect(
                {
                    choices: [
                        { name: "View logs", value: "l" },
                        { name: "Build and redeploy", value: "b" },
                        { name: "Quit", value: "q" },
                    ] as const,
                },
                { signal: controller.signal },
            );
            switch (option) {
                case "l": {
                    try {
                        await log?.parseAsync(
                            ["--project-name", projectName, "--follow"],
                            {
                                from: "user",
                            },
                        );
                    } catch (error: unknown) {
                        if (error instanceof ExecaError) {
                            // just continue gracefully
                            if (error.exitCode === 130) {
                                break;
                            }
                            throw error;
                        }
                    }
                    break;
                }
                case "b": {
                    // the PRT nodes read the machine the build replaces, and
                    // claim for the application the redeploy removes
                    await stopPrtNodes({
                        projectName,
                        services: prtServices,
                    });
                    prtServices = [];

                    // build
                    await build?.parseAsync([], { from: "user" });

                    // redeploy
                    const hash = await getMachineHash({ sdk });
                    if (hash) {
                        // the accounts drive may have moved with the rebuild,
                        // resolved before undeploying in case it is now invalid
                        const withdrawalConfig = resolveWithdrawalConfig();
                        // a PRT redeploy creates a new consensus, with the
                        // sentries as they are in the config now. The node's
                        // mode can't change: it is fixed in its database
                        const resolved = resolvePrt();
                        const moved = readerModeChanged(
                            options.prtConfig,
                            resolved,
                        );
                        if (moved !== undefined) {
                            console.warn(chalk.yellow(`WARNING: ${moved}`));
                        }
                        const prtConfig =
                            moved === undefined ? resolved : options.prtConfig;
                        reportPrtWarnings(prtConfig, claimStagingPeriod);
                        await fundPrtNodes({ environment, prtConfig });
                        if (lastDeployment) {
                            await undeploy({ projectName });
                        }
                        lastDeployment = await deploy({
                            consensus: lastDeployment?.consensus,
                            epochLength,
                            hash,
                            projectName,
                            prt,
                            prtConfig,
                            salt: numberToHex(salt++, { size: 32 }),
                            withdrawalConfig,
                            claimStagingPeriod,
                        });
                        lastStatus = lastDeployment?.status;
                        pendingReport = undefined;
                        prtServices = await runPrtNodes({
                            application: lastDeployment.address,
                            environment,
                            prtConfig,
                        });
                    }

                    break;
                }
                case "q": {
                    return;
                }
            }
        } catch (error: unknown) {
            if (error instanceof AbortPromptError) {
                // the status changed while the prompt was open; report and re-prompt
                continue;
            }
            if (error instanceof ExitPromptError) {
                // gracefully exit
                return;
            }
            throw error;
        } finally {
            clearInterval(watcher);
        }
    }
};

const undeploy = async (options: { projectName: string }) => {
    const { projectName } = options;
    const progress = ora(`${chalk.cyan(projectName)} undeploying...`).start();
    await removeApplication({
        application: projectName,
        force: true,
        projectName,
    });
    progress.succeed(`${chalk.cyan(projectName)} undeployed`);
};

/**
 * Warn about [prt] settings that are valid but have no effect.
 */
const reportPrtWarnings = (
    prtConfig: ResolvedPrt | undefined,
    claimStagingPeriod: number,
) => {
    for (const warning of prtConfig?.warnings ?? []) {
        console.warn(chalk.yellow(`WARNING: ${warning}`));
    }
    if (
        prtConfig &&
        sentriesOf(prtConfig).length > 0 &&
        claimStagingPeriod === 0
    ) {
        console.warn(
            chalk.yellow(
                "WARNING: with --claim-staging-period 0 a staged claim is accepted at once, so the sentries have no effect",
            ),
        );
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
 * Starts the PRT nodes the CLI runs, for the deployed application, then prints
 * the rollups-node's line, the manager and every [prt.nodes] entry in file
 * order: a check for each one running, a note for each one appointed only.
 * @returns the services started
 */
const runPrtNodes = async (options: {
    application: Address;
    environment: EnvironmentOptions;
    prtConfig?: ResolvedPrt;
}): Promise<string[]> => {
    const { application, environment, prtConfig } = options;
    if (
        !prtConfig ||
        (prtConfig.nodes.length === 0 &&
            prtConfig.reference.label === undefined)
    ) {
        return [];
    }

    const nodes = runnableNodes(prtConfig);
    const progress = ora();
    let services: string[] = [];
    if (nodes.length > 0) {
        progress.start(
            `starting ${nodes.length === 1 ? "the PRT node" : `${nodes.length} PRT nodes`}...`,
        );
        try {
            services = await startPrtNodes({
                ...environment,
                application,
                imageTag: environment.runtimeVersion,
                nodes: prtConfig.nodes,
            });
            progress.stop();
        } catch (error: unknown) {
            progress.fail("the PRT nodes failed to start");
            throw error;
        }
    }

    // log-symbols' blue info mark is hard to read on a dark terminal
    const note = (text: string) =>
        progress.stopAndPersist({ symbol: chalk.cyan("ℹ"), text });
    if (prtConfig.reference.claim) {
        note(describeReference(prtConfig));
    } else {
        progress.warn(describeReference(prtConfig));
    }
    if (prtConfig.sentryManager === undefined) {
        progress.warn("sentry manager none (the sentries can't be rotated)");
    } else {
        note(`sentry manager ${prtConfig.sentryManager}`);
    }
    for (const node of prtConfig.nodes) {
        if (node.type === undefined) {
            note(describePrtNode(node));
        } else {
            progress.succeed(describePrtNode(node));
        }
    }
    return services;
};

const deploy = async (options: {
    consensus?: Address;
    epochLength: number;
    hash: Hex;
    projectName: string;
    prt?: boolean;
    prtConfig?: ResolvedPrt;
    salt: Hex;
    withdrawalConfig?: WithdrawalConfig;
    claimStagingPeriod: number;
}) => {
    const {
        consensus,
        epochLength,
        hash,
        projectName,
        prt,
        prtConfig,
        salt,
        withdrawalConfig,
        claimStagingPeriod,
    } = options;

    // deploy application to node (onchain and offchain)
    const progress = ora(
        `deploying ${chalk.cyan(hash)} as ${chalk.cyan(projectName)}`,
    );

    const application = await deployApplication({
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
        claimStagingPeriod,
    });
    progress.succeed(
        `${chalk.cyan(projectName)} machine hash is ${chalk.cyan(hash)}`,
    );
    progress.succeed(
        `${chalk.cyan(projectName)} contract deployed at ${chalk.cyan(application.address)}`,
    );
    return application;
};

const configureFork = async (options: {
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

export const createRunCommand = () => {
    return new Command("run")
        .description("Run a local cartesi node for the application.")
        .addOption(
            new Option(
                "--prt",
                "deploy the application on a PRT consensus, with the [prt] section of cartesi.toml",
            ).default(false),
        )
        .addOption(
            new Option(
                "--block-time <number>",
                "interval between blocks (in seconds)",
            )
                .argParser(Number)
                .default(2),
        )
        .addOption(
            new Option(
                "--cpus <number>",
                "number of cpu limits for the rollups-node",
            ).argParser(Number),
        )
        .addOption(
            new Option(
                "--default-block <string>",
                "default block to be used when fetching new blocks.",
            )
                .choices(["latest", "safe", "finalized"])
                .default("latest"),
        )
        .option("--dry-run", "show the docker compose configuration", false)
        .option(
            "--list-supported-variables",
            "Returns JSON formatted information about the environment variables allowed and which service will use them.",
            false,
        )
        .option("--fork-url <url>", "RPC URL to fork from")
        .addOption(
            new Option(
                "--fork-block-number <number>",
                "block number to fork from",
            ).argParser(Number),
        )
        .addOption(
            new Option(
                "--memory <number>",
                "memory limit for the rollups-node in MB",
            ).argParser(Number),
        )
        .addOption(
            new Option(
                "--epoch-length <number>",
                "length of an epoch (in blocks)",
            )
                .argParser(Number)
                .default(720),
        )
        .option("-p, --port <number>", "port to listen on", Number)
        .addOption(
            new Option(
                "--claim-staging-period <number>",
                "claim staging period (in blocks). Number of blocks between a claim being submitted and accepted",
            )
                .argParser(Number)
                .default(0),
        )
        .option(
            "-c, --config <config>",
            "Path to the configuration file (.toml)",
            (value, prev) => prev.concat([value]),
            ["cartesi.toml"],
        )
        .addOption(
            new Option(
                "--runtime-version <version>",
                "version for Cartesi Rollups Runtime to use",
            )
                .default(DEFAULT_SDK_VERSION)
                .hideHelp(),
        )
        .option(
            "--project-name <string>",
            "name of project (used by docker compose and cartesi-rollups-node)",
        )
        .option(
            "--services <string>",
            `optional services to start, comma separated list from [${AVAILABLE_SERVICES.join(", ")}]`,
            commaSeparatedList,
            [],
        )
        .option("-v, --verbose", "verbose output", false)
        .action(async (options, program) => {
            const {
                prt,
                blockTime,
                cpus,
                defaultBlock,
                dryRun,
                epochLength,
                memory,
                runtimeVersion,
                services,
                verbose,
                listSupportedVariables,
                claimStagingPeriod,
                config: configFiles,
            } = options;

            const progress = ora();

            if (listSupportedVariables) {
                const allowedVarsByService = {
                    rollupsNode: nodeAllowedEnvironmentVariables,
                };

                // output the allowed environment variables by service in a JSON format and quit
                process.stdout.write(
                    JSON.stringify(allowedVarsByService, null, 2),
                );
                return;
            }

            if (defaultBlock !== "finalized") {
                console.warn(
                    chalk.yellow(
                        `WARNING: default block is set to '${defaultBlock}', production configuration will likely use 'finalized'`,
                    ),
                );
            }

            // project name explicitly defined or the current directory name
            const projectName = getProjectName(options);

            // get application configuration (e.g. use withdrawal config if present)
            const applicationConfig = getApplicationConfig(configFiles);

            // [prt] is parsed either way, so a mistake in it fails early, but
            // the node takes sentries only on a PRT deploy. Read again on a
            // rebuild, like the withdrawal config.
            const resolvePrt = () => {
                const config = getApplicationConfig(configFiles);
                return prt && config.prt
                    ? resolvePrtNodes(config.prt, {
                          guardian:
                              config.withdrawal?.guardian ?? DEVNET_GUARDIAN,
                      })
                    : undefined;
            };
            if (applicationConfig.prt && !prt) {
                console.log(
                    chalk.dim("[prt] in cartesi.toml is ignored without --prt"),
                );
            }

            // fail before starting the environment if [prt] can't be resolved
            const prtConfig = resolvePrt();
            reportPrtWarnings(prtConfig, claimStagingPeriod);

            // in reader mode the node has no PRT signer
            const claimSubmission = prtConfig?.reference.claim ?? true;
            if (!claimSubmission) {
                const hostVars = getCartesiEnvironmentVariables();
                const prtAuth = nodePrtAuthVariables.filter(
                    (name) => hostVars[name] !== undefined,
                );
                if (prtAuth.length > 0) {
                    console.warn(
                        chalk.yellow(
                            `WARNING: ${prtAuth.join(", ")} ${prtAuth.length === 1 ? "is" : "are"} set, but [prt.nodes.${prtConfig?.reference.label}] has claim = false, so the rollups-node runs in reader mode with no PRT signer and the value is dropped`,
                        ),
                    );
                }
            }

            // resolve port number, using the first free port in a range, unless explicitly set
            const port =
                options.port ||
                (await getPort({
                    port: portNumbers(PREFERRED_PORT, PREFERRED_PORT + 10),
                }));

            // configure optional anvil fork
            const forkConfig = await configureFork(options);

            if (forkConfig) {
                await assertForkConfig(forkConfig, { includePRT: prt });
            }

            // emergency withdrawal configuration, derived from the accounts drive of the built
            // machine. The configuration is read again, as a rebuild may have changed it.
            const imagePath = getContextPath("image");
            const resolveWithdrawalConfig = () =>
                getWithdrawalConfig(
                    getApplicationConfig(configFiles),
                    imagePath,
                    {
                        fork: forkConfig !== undefined,
                    },
                );

            // fail before starting the environment if it can't be derived
            const withdrawalConfig = fs.existsSync(imagePath)
                ? resolveWithdrawalConfig()
                : undefined;

            // if TTY is not attached, run on foreground (not detached)
            const detach = process.stdin.isTTY;

            const environment: EnvironmentOptions = {
                blockTime,
                cpus,
                defaultBlock,
                forkConfig,
                memory,
                port,
                projectName,
                prt,
                claimSubmission,
                runtimeVersion,
                services,
                verbose,
            };

            // run compose environment (detached)
            const { cmd, config } = await startEnvironment({
                ...environment,
                detach,
                dryRun,
            });

            // host address
            const address = `${host}:${port}`;

            if (dryRun && config) {
                // just show the docker compose configuration and quit
                process.stdout.write(config);
                return;
            }

            progress.succeed(
                `${chalk.cyan(projectName)} starting at ${chalk.cyan(`${address}`)}`,
            );

            // wait for the environment to be healthy
            await waitHealthyEnvironment({
                name: projectName,
                port,
                projectName,
                services,
            });

            // deploy the application
            let deployment: RollupsDeployment | undefined;
            let prtServices: string[] = [];
            let salt = 0;
            const hash = await getMachineHash({
                sdk: applicationConfig.sdk,
            });
            if (hash) {
                await fundPrtNodes({ environment, prtConfig });
                deployment = await deploy({
                    epochLength,
                    hash,
                    projectName,
                    prt,
                    prtConfig,
                    salt: numberToHex(salt++, { size: 32 }),
                    claimStagingPeriod,
                    withdrawalConfig,
                });
                prtServices = await runPrtNodes({
                    application: deployment.address,
                    environment,
                    prtConfig,
                });
            } else {
                console.warn(
                    chalk.yellow(
                        "machine snapshot not found, waiting for build",
                    ),
                );
            }

            const shutdown = async () => {
                progress.start(`${chalk.cyan(projectName)} stopping...`);
                try {
                    await stopEnvironment({ projectName });
                    progress.succeed(`${chalk.cyan(projectName)} stopped`);
                } catch (e: unknown) {
                    progress.fail(
                        e instanceof Error ? e.message : "Unknown error",
                    );
                }
                process.exit(0);
            };

            if (detach) {
                // inhibit SIGINT and SIGTERM, will be handled gracefully by the shell
                process.on("SIGINT", () => {});
                process.on("SIGTERM", () => {});

                const log = program.parent?.commands.find(
                    (c) => c.name() === "logs",
                );
                const build = program.parent?.commands.find(
                    (c) => c.name() === "build",
                );
                await shell({
                    build,
                    deployment,
                    environment,
                    epochLength,
                    log,
                    projectName,
                    prt,
                    salt,
                    sdk: applicationConfig.sdk,
                    prtServices,
                    prtConfig,
                    claimStagingPeriod,
                    resolveWithdrawalConfig,
                    resolvePrt,
                });
                await shutdown();
            } else {
                process.on("SIGINT", shutdown);
                process.on("SIGTERM", shutdown);
                try {
                    await cmd;
                } catch (error: unknown) {
                    if (error instanceof ExecaError) {
                        // just continue gracefully
                        if (error.exitCode === 130) {
                            return;
                        }
                        throw error;
                    }
                }
            }
        });
};
