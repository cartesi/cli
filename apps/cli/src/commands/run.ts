import {
    Command,
    type CommandUnknownOpts,
    Option,
} from "@commander-js/extra-typings";
import { ExitPromptError } from "@inquirer/core";
import chalk from "chalk";
import ora from "ora";
import { type Address, type Hex, numberToHex } from "viem";
import { getMachineHash } from "../base.js";
import { DEFAULT_SDK_VERSION } from "../config.js";
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
}) => {
    const { build, epochLength, log, projectName } = options;

    // keep track of last deployment
    let lastDeployment: RollupsDeployment | undefined = undefined;
    let salt = 0;

    // deploy for the first time
    const hash = getMachineHash();
    if (hash) {
        lastDeployment = await deploy({
            epochLength,
            hash,
            projectName,
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
                    await log?.parseAsync(["--environment-name", projectName], {
                        from: "user",
                    });
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
            console.error(error);
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
    salt: Hex;
}) => {
    const { consensus, epochLength, hash, projectName, salt } = options;

    // deploy application to node (onchain and offchain)
    const progress = ora(
        `deploying ${chalk.cyan(hash)} as ${chalk.cyan(projectName)}`,
    );

    const application = await deployApplication({
        consensus,
        epochLength,
        name: projectName,
        projectName,
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
        .option("-p, --port <number>", "port to listen on", Number, 6751)
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
                blockTime,
                cpus,
                defaultBlock,
                dryRun,
                epochLength,
                memory,
                port,
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

            // run compose environment (detached)
            const { address, config, projectName } = await startEnvironment({
                blockTime,
                cpus,
                defaultBlock,
                dryRun,
                memory,
                port,
                projectName: options.projectName,
                runtimeVersion,
                services,
                verbose,
            });

            if (dryRun) {
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

            process.on("SIGINT", shutdown);
            process.on("SIGTERM", shutdown);
            process.on("uncaughtException", async (err) => {
                console.error(err);
                await shutdown();
                process.exit(1);
            });

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
            });
            await shutdown();
        });
};
