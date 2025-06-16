import {
    Command,
    type CommandUnknownOpts,
    Option,
} from "@commander-js/extra-typings";
import { ExitPromptError } from "@inquirer/core";
import chalk from "chalk";
import getPort, { portNumbers } from "get-port";
import ora from "ora";
import { type Address, type Hex, encodeFunctionData, numberToHex } from "viem";
import { getMachineHash, getProjectName } from "../base.js";
import { DEFAULT_SDK_VERSION, PREFERRED_PORT } from "../config.js";
import { dataAvailabilityAbi, inputBoxAddress } from "../contracts.js";
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
    dataAvailability?: Hex;
    epochLength: number;
    log?: CommandUnknownOpts;
    projectName: string;
}) => {
    const { build, dataAvailability, epochLength, log, projectName } = options;

    // keep track of last deployment
    let lastDeployment: RollupsDeployment | undefined = undefined;
    let salt = 0;

    // deploy for the first time
    const hash = getMachineHash();
    if (hash) {
        lastDeployment = await deploy({
            dataAvailability,
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
                    await log?.parseAsync(["--project-name", projectName], {
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
                            dataAvailability: lastDeployment?.dataAvailability,
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
    dataAvailability?: Hex;
    epochLength: number;
    hash: Hex;
    projectName: string;
    salt: Hex;
}) => {
    const {
        consensus,
        dataAvailability,
        epochLength,
        hash,
        projectName,
        salt,
    } = options;

    // deploy application to node (onchain and offchain)
    const progress = ora(
        `deploying ${chalk.cyan(hash)} as ${chalk.cyan(projectName)}`,
    );

    const application = await deployApplication({
        consensus,
        dataAvailability,
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

const createEspressoDataAvailability = (block: bigint, namespace: number) => {
    return encodeFunctionData({
        abi: dataAvailabilityAbi,
        functionName: "InputBoxAndEspresso",
        args: [inputBoxAddress, block, namespace],
    });
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

            // use 1 as the starting block and 1 for namespace for espresso dev
            const dataAvailability = services.includes("espresso")
                ? createEspressoDataAvailability(1n, 1)
                : undefined;

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
                dataAvailability,
                epochLength,
                log,
                projectName,
            });
            await shutdown();
        });
};
