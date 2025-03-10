import { Command } from "@commander-js/extra-typings";

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
    return command;
};

export type CoprocessorCommandOpts = ReturnType<
    ReturnType<typeof createCoprocessorCommand>["opts"]
>;
