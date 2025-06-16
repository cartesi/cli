import { Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import ora from "ora";
import {
    DEFAULT_COMPOSE_ENVIRONMENT_NAME,
    DEFAULT_SDK_VERSION,
} from "../config.js";
import {
    AVAILABLE_SERVICES,
    startEnvironment,
    waitHealthyEnvironment,
} from "../exec/rollups.js";

const commaSeparatedList = (value: string) => value.split(",");

export const createStartCommand = () => {
    return new Command("start")
        .description("Start a local environment.")
        .configureHelp({ showGlobalOptions: true })
        .addOption(
            new Option(
                "--runtime-version <version>",
                "version for Cartesi Rollups Runtime to use",
            )
                .default(DEFAULT_SDK_VERSION)
                .hideHelp(),
        )
        .option(
            "--environment-name <string>",
            "name of environment",
            DEFAULT_COMPOSE_ENVIRONMENT_NAME,
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
                "--default-block <string>",
                "default block to be used when fetching new blocks.",
            )
                .choices(["latest", "safe", "pending", "finalized"])
                .default("latest"),
        )
        .addOption(
            new Option(
                "--cpus <number>",
                "number of cpu limits for the rollups-node",
            ).argParser(Number),
        )
        .addOption(
            new Option(
                "--memory <number>",
                "memory limit for the rollups-node in MB",
            ).argParser(Number),
        )
        .option(
            "--services <string>",
            `optional services to start, comma separated list from [${AVAILABLE_SERVICES.join(", ")}]`,
            commaSeparatedList,
            [],
        )
        .option("-p, --port <number>", "port to listen on", Number, 6751)
        .option("--dry-run", "show the docker compose configuration", false)
        .option("-v, --verbose", "verbose output", false)
        .action(async (options, command) => {
            const {
                blockTime,
                cpus,
                defaultBlock,
                dryRun,
                environmentName,
                memory,
                port,
                services,
                verbose,
                runtimeVersion,
            } = options;

            const { address, config, projectName } = await startEnvironment({
                blockTime,
                cpus,
                defaultBlock,
                dryRun,
                port,
                runtimeVersion,
                services,
                verbose,
                memory,
                projectName: environmentName,
            });

            if (dryRun) {
                // show the docker compose configuration
                process.stdout.write(config);
                return;
            }

            if (defaultBlock !== "finalized") {
                console.warn(
                    chalk.yellow(
                        `WARNING: default block is set to '${defaultBlock}', production configuration will likely use 'finalized'`,
                    ),
                );
            }

            const progress = ora();

            progress.succeed(
                `${chalk.cyan(projectName)} starting at ${chalk.cyan(`${address}`)}`,
            );

            // wait for the environment to be healthy
            await waitHealthyEnvironment({ port, projectName, services });
        });
};
