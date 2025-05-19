import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";

export const createRunCommand = () => {
    return new Command("run")
        .description("Run a local cartesi node for the application.")
        .summary("DEPRECATED: use 'start' instead")
        .action(async () => {
            console.warn(
                chalk.yellow(
                    "run command is deprecated, use 'start' and 'deploy' instead",
                ),
            );
        });
};
