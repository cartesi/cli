import { Command } from "@commander-js/extra-typings";
import { createStartCommand } from "./coprocessor/start.js";

export const createCoprocessorCommand = () => {
    const command = new Command("coprocessor")
        .option(
            "--project-name <string>",
            "name of environment",
            "cartesi-croprocessor",
        )
        .action(async (_options, program) => {
            program.help();
        });
    command.addCommand(createStartCommand());
    return command;
};

export type CoprocessorCommandOpts = ReturnType<
    ReturnType<typeof createCoprocessorCommand>["opts"]
>;
