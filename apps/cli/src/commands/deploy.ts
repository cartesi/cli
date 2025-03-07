import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import { createBuildCommand } from "./deploy/build.js";

export const createDeployCommand = () => {
    const command = new Command("deploy")
        .description(
            "DEPRECATED: Package and deploy the application to a supported live network.",
        )
        .action(async () => {
            console.warn(
                chalk.yellow(
                    "deploy command is deprecated, use 'rollups deploy' instead",
                ),
            );
        });
    command.addCommand(createBuildCommand(), { hidden: true });
    return command;
};
