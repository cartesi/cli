import { Command } from "@commander-js/extra-typings";
import { createCreateCommand } from "./coprocessor/create.js";
import { createStartCommand } from "./coprocessor/start.js";

export const createCoprocessorCommand = () => {
    const command = new Command("coprocessor")
        .option(
            "--project-name <string>",
            "name of environment",
            "cartesi-coprocessor",
        )
        .action(async (_options, program) => {
            program.help();
        });
    command.addCommand(createStartCommand());
    command.addCommand(createCreateCommand());
    return command;
};

export type CoprocessorCommandOpts = ReturnType<
    ReturnType<typeof createCoprocessorCommand>["opts"]
>;