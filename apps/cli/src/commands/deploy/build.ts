import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";

export const createBuildCommand = () => {
    return new Command("build")
        .description(
            "DEPRECATED: Package the application in a Docker image ready to be deployed.",
        )
        .action(async () => {
            console.warn(chalk.yellow("deploy build command is deprecated"));
        });
};
