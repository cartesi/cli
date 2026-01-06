import {
    Command,
    type CommandUnknownOpts,
    Option,
} from "@commander-js/extra-typings";
import { ExitPromptError } from "@inquirer/core";
import chalk from "chalk";
import { ExecaError } from "execa";
import getPort, { portNumbers } from "get-port";
import ora from "ora";
import { type Address, type Hex, numberToHex } from "viem";
import { getMachineHash, getProjectName } from "../base.js";
import { DEFAULT_SDK_VERSION, PREFERRED_PORT } from "../config.js";
import {
    AVAILABLE_SERVICES,
    type RollupsDeployment,
    deployApplication,
    removeApplication,
    startEnvironment,
    stopEnvironment,
    waitHealthyEnvironment,
} from "../exec/rollups.js";
import { keySelect } from "../prompts.js";

const commaSeparatedList = (value: string) => value.split(",");

const shell = async (options: {
    build?: CommandUnknownOpts;
    epochLength: number;
    log?: CommandUnknownOpts;
    projectName: string;
    prt?: boolean;
}) => {
    const { build, epochLength, log, projectName, prt } = options;

    // keep track of last deployment
    let lastDeployment: RollupsDeployment | undefined;
    let salt = 0;

    // deploy for the first time
    const hash = getMachineHash();
    if (hash) {
        lastDeployment = await deploy({
            epochLength,
            hash,
            projectName,
            prt,
            salt: numberToHex(salt++, { size: 32 }),
        });
    } else {
        console.warn(
            chalk.yellow("machine snapshot not found, waiting for build"),
        );
    }

    while (true) {
        try {
            const option = await keySelect(
                {
                    choices: [
                        { name: "View logs", value: "l" },
                        { name: "Build and redeploy", value: "b" },
                        { name: "Quit", value: "q" },
                    ] as const,
                },
                {},
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
                    const hash = getMachineHash();
                    if (hash) {
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
                        });
                    }

                    break;
                }
                case "q": {
                    return;
                }
            }
        } catch (error: unknown) {
            if (error instanceof ExitPromptError) {
                // gracefully exit
                return;
            }
            throw error;
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
}) => {
    const { consensus, epochLength, hash, projectName, prt, salt } = options;

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
    });
    progress.succeed(
        `${chalk.cyan(projectName)} machine hash is ${chalk.cyan(hash)}`,
    );
    progress.succeed(
        `${chalk.cyan(projectName)} contract deployed at ${chalk.cyan(application.address)}`,
    );
    return application;
};

export const createRunCommand = () => {
    return new Command("run")
        .description("Run a local cartesi node for the application.")
        .addOption(
            new Option(
                "--authority",
                "deploy application with authority consensus",
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
                authority,
                blockTime,
                cpus,
                defaultBlock,
                dryRun,
                epochLength,
                memory,
                runtimeVersion,
                services,
                verbose,
            } = options;

            const progress = ora();

            if (defaultBlock !== "finalized") {
                console.warn(
                    chalk.yellow(
                        `WARNING: default block is set to '${defaultBlock}', production configuration will likely use 'finalized'`,
                    ),
                );
            }

            // project name explicitly defined or the current directory name
            const projectName = getProjectName(options);

            // resolve port number, using the first free port in a range, unless explicitly set
            const port =
                options.port ||
                (await getPort({
                    port: portNumbers(PREFERRED_PORT, PREFERRED_PORT + 10),
                }));

            // run compose environment (detached)
            const { address, config } = await startEnvironment({
                blockTime,
                cpus,
                defaultBlock,
                dryRun,
                memory,
                port,
                projectName,
                runtimeVersion,
                services,
                verbose,
            });

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
                epochLength,
                log,
                projectName,
                prt: !authority,
            });
            await shutdown();
        });
};
