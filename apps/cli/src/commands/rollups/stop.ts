import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import { execa } from "execa";
import ora from "ora";

export const registerStopCommand = (program: Command) => {
    program
        .command("stop")
        .description("Stop a local rollups node environment.")
        .option(
            "--project-name <project-name>",
            "Project name",
            "cartesi-rollups",
        )
        .action(async ({ projectName }) => {
            const progress = ora(
                `Stopping ${chalk.cyan(projectName)} environment...`,
            ).start();
            try {
                await execa("docker", [
                    "compose",
                    "-p",
                    projectName,
                    "down",
                    "--volumes",
                ]);
                progress.succeed(
                    `${chalk.cyan(projectName)} environment stopped.`,
                );
            } catch (e: unknown) {
                progress.fail((e as Error).message);
            }
        });
};
