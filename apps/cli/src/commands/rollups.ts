import { Command } from "@commander-js/extra-typings";
import { registerDeployCommand } from "./rollups/deploy.js";
import { registerStartCommand } from "./rollups/start.js";
import { registerStatusCommand } from "./rollups/status.js";
import { registerStopCommand } from "./rollups/stop.js";

export const registerRollupsCommand = (program: Command) => {
    const rollupsCommand = program
        .command("rollups")
        .action(async (_options, program) => {
            program.help();
        });
    registerStartCommand(rollupsCommand);
    registerStatusCommand(rollupsCommand);
    registerStopCommand(rollupsCommand);
    registerDeployCommand(rollupsCommand);
};
