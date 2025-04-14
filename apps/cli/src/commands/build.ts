import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";

export const createBuildCommand = () => {
    return new Command("build")
        .summary("DEPRECATED: use 'rollups build' instead")
        .action(async () => {
            console.warn(
                chalk.yellow(
                    "build command is deprecated, use 'rollups build' instead",
                ),
            );
        });
};
