import { Command, Option } from "@commander-js/extra-typings";
import { ExitPromptError } from "@inquirer/core";
import chalk from "chalk";
import { ExecaError } from "execa";
import ora from "ora";
import { build } from "../api/build.js";
import { logs } from "../api/logs.js";
import { run, type RunResult } from "../api/run.js";
import { nodeAllowedEnvironmentVariables } from "../compose/node.js";
import { AVAILABLE_SERVICES } from "../exec/rollups.js";
import { keySelect } from "../prompts.js";

const commaSeparatedList = (value: string) => value.split(",");

const shell = async (options: {
    config: string[];
    node: RunResult;
    verbose?: boolean;
}) => {
    const { config, node, verbose } = options;
    const { projectName } = node;

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
                        await logs({
                            follow: true,
                            projectName,
                            stream: true,
                        });
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
                    await build({
                        config,
                        progress: verbose ? "verbose" : "default",
                    });

                    // redeploy
                    await node.deploy();

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

export const createRunCommand = () => {
    return new Command("run")
        .description("Run a local cartesi node for the application.")
        .addOption(new Option("--prt", "deploy application with PRT consensus"))
        .addOption(
            new Option(
                "--block-time <number>",
                "interval between blocks (in seconds) (default: 2)",
            ).argParser(Number),
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
                "default block to be used when fetching new blocks. (default: latest)",
            ).choices(["latest", "safe", "pending", "finalized"]),
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
                "length of an epoch (in blocks) (default: 720)",
            ).argParser(Number),
        )
        .option("-p, --port <number>", "port to listen on", Number)
        .addOption(
            new Option(
                "--claim-staging-period <number>",
                "claim staging period (in blocks). Number of blocks between a claim being submitted and accepted (Authority/Quorum Only) (default: 0)",
            ).argParser(Number),
        )
        .addOption(
            new Option(
                "-c, --config <config>",
                "path to the configuration file",
            )
                .argParser<string[]>((value, prev) => prev.concat([value]))
                .default(
                    [] as string[],
                    "the configuration file of the project",
                ),
        )
        .addOption(
            new Option(
                "--runtime-version <version>",
                "version for Cartesi Rollups Runtime to use",
            ).hideHelp(),
        )
        .option(
            "--project-name <string>",
            "name of project (used by docker compose and cartesi-rollups-node)",
        )
        .option(
            "--services <string>",
            `optional services to start, comma separated list from [${AVAILABLE_SERVICES.join(", ")}]`,
            commaSeparatedList,
        )
        .option("-v, --verbose", "verbose output")
        .action(async (options) => {
            const {
                prt,
                blockTime,
                config,
                cpus,
                defaultBlock,
                dryRun,
                epochLength,
                forkBlockNumber,
                forkUrl,
                memory,
                port,
                projectName,
                runtimeVersion,
                services,
                verbose,
                listSupportedVariables,
                claimStagingPeriod,
            } = options;

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

            // if TTY is not attached, run on foreground (not detached)
            const detach = !!process.stdin.isTTY;

            const node = await run({
                blockTime,
                claimStagingPeriod,
                config,
                cpus,
                defaultBlock,
                detach,
                dryRun,
                epochLength,
                forkBlockNumber,
                forkUrl,
                memory,
                port,
                progress: verbose ? "verbose" : "default",
                projectName,
                prt,
                runtimeVersion,
                services,
                verbose,
            });

            if (dryRun) {
                // just show the docker compose configuration and quit
                if (node.config) {
                    process.stdout.write(node.config);
                }
                return;
            }

            if (!node.deployment) {
                console.warn(
                    chalk.yellow(
                        "machine snapshot not found, waiting for build",
                    ),
                );
            }

            const shutdown = async () => {
                const progress = ora().start(
                    `${chalk.cyan(node.projectName)} stopping...`,
                );
                try {
                    await node.stop();
                    progress.succeed(`${chalk.cyan(node.projectName)} stopped`);
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

                await shell({ config, node, verbose });
                await shutdown();
            } else {
                process.on("SIGINT", shutdown);
                process.on("SIGTERM", shutdown);
                try {
                    await node.cmd;
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
