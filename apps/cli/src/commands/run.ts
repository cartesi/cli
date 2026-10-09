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
    getContextPath,
    getMachineHash,
    getProjectName,
} from "../base.js";
import { nodeAllowedEnvironmentVariables } from "../compose/node.js";
import {
    DEFAULT_SDK_VERSION,
    PREFERRED_PORT,
    type WithdrawalConfig,
} from "../config.js";
import {
    AVAILABLE_SERVICES,
    deployApplication,
    host,
    removeApplication,
    getDeployments,
    type RollupsDeployment,
    startEnvironment,
    stopEnvironment,
    TERMINAL_APPLICATION_STATUSES,
    waitHealthyEnvironment,
} from "../exec/rollups.js";
import { keySelect } from "../prompts.js";
import type { ForkConfig } from "../types/chain.js";
import { assertForkConfig } from "../validations.js";
import { getWithdrawalConfig } from "../withdrawal.js";

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
    epochLength: number;
    log?: CommandUnknownOpts;
    projectName: string;
    prt?: boolean;
    salt: number;
    sdk: string;
    resolveWithdrawalConfig: () => WithdrawalConfig | undefined;
    claimStagingPeriod: number;
}) => {
    const {
        build,
        epochLength,
        log,
        projectName,
        prt,
        sdk,
        resolveWithdrawalConfig,
        claimStagingPeriod,
    } = options;

    let lastDeployment = options.deployment;
    let salt = options.salt;
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
                    // build
                    await build?.parseAsync([], { from: "user" });

                    // redeploy
                    const hash = await getMachineHash({ sdk });
                    if (hash) {
                        // the accounts drive may have moved with the rebuild,
                        // resolved before undeploying in case it is now invalid
                        const withdrawalConfig = resolveWithdrawalConfig();
                        if (lastDeployment) {
                            await undeploy({ projectName });
                        }
                        lastDeployment = await deploy({
                            consensus: lastDeployment?.consensus,
                            epochLength,
                            hash,
                            projectName,
                            prt,
                            salt: numberToHex(salt++, { size: 32 }),
                            withdrawalConfig,
                            claimStagingPeriod,
                        });
                        lastStatus = lastDeployment?.status;
                        pendingReport = undefined;
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

const deploy = async (options: {
    consensus?: Address;
    epochLength: number;
    hash: Hex;
    projectName: string;
    prt?: boolean;
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
                "deploy application with PRT consensus",
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
                .choices(["latest", "safe", "pending", "finalized"])
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

            // run compose environment (detached)
            const { cmd, config } = await startEnvironment({
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
            let salt = 0;
            const hash = await getMachineHash({
                sdk: applicationConfig.sdk,
            });
            if (hash) {
                deployment = await deploy({
                    epochLength,
                    hash,
                    projectName,
                    prt,
                    salt: numberToHex(salt++, { size: 32 }),
                    claimStagingPeriod,
                    withdrawalConfig,
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
                    epochLength,
                    log,
                    projectName,
                    prt,
                    salt,
                    sdk: applicationConfig.sdk,
                    claimStagingPeriod,
                    resolveWithdrawalConfig,
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
