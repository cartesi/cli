import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";

export const createCreateCommand = () => {
    return new Command("create")
        .summary("DEPRECATED: use 'rollups create' instead")
        .action(async () => {
            console.warn(
                chalk.yellow(
                    "create command is deprecated, use 'rollups create' instead",
                ),
            );
        });
};
