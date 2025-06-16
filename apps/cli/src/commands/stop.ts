import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import ora from "ora";
import { DEFAULT_COMPOSE_ENVIRONMENT_NAME } from "../config.js";
import { stopEnvironment } from "../exec/rollups.js";

export const createStopCommand = () => {
    return new Command("stop")
        .description("Stop a local environment.")
        .configureHelp({ showGlobalOptions: true })
        .option(
            "--environment-name <string>",
            "name of environment",
            DEFAULT_COMPOSE_ENVIRONMENT_NAME,
        )
        .action(async ({ environmentName }, command) => {
            const progress = ora(
                `Stopping ${chalk.cyan(environmentName)} environment...`,
            ).start();
            try {
                await stopEnvironment({ projectName: environmentName });
                progress.succeed(
                    `${chalk.cyan(environmentName)} environment stopped.`,
                );
            } catch (e: unknown) {
                progress.fail((e as Error).message);
            }
        });
};
