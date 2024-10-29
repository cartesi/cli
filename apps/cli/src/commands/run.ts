import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";

export const registerRunCommand = (program: Command) => {
    program
        .command("run", { hidden: true })
        .description("Run a local cartesi node for the application.")
        .summary("DEPRECATED: use 'rollups start' instead")
        .action(async () => {
            console.warn(
                chalk.yellow(
                    "run command is deprecated, use 'rollups start' and 'rollups deploy' instead",
                ),
            );
        });
};
