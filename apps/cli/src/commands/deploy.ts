import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import { registerBuildCommand } from "./deploy/build.js";

export const registerDeployCommand = (program: Command) => {
    const deployCommand = program
        .command("deploy", { hidden: true })
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
    registerBuildCommand(deployCommand);
};
