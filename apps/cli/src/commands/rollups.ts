import { Command } from "@commander-js/extra-typings";
import { createBuildCommand } from "./rollups/build.js";
import { createCreateCommand } from "./rollups/create.js";
import { createDeployCommand } from "./rollups/deploy.js";
import { createLogsCommand } from "./rollups/logs.js";
import { createStartCommand } from "./rollups/start.js";
import { createStatusCommand } from "./rollups/status.js";
import { createStopCommand } from "./rollups/stop.js";

export const createRollupsCommand = () => {
    const command = new Command("rollups")
        .option(
            "--environment-name <string>",
            "name of environment",
            "cartesi-rollups",
        )
        .action(async (_options, program) => {
            program.help();
        });
    command.addCommand(createLogsCommand());
    command.addCommand(createStartCommand());
    command.addCommand(createStatusCommand());
    command.addCommand(createStopCommand());
    command.addCommand(createDeployCommand());
    command.addCommand(createCreateCommand());
    command.addCommand(createBuildCommand());
    return command;
};

export type RollupsCommandOpts = ReturnType<
    ReturnType<typeof createRollupsCommand>["opts"]
>;
