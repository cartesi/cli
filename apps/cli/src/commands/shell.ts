import { Command, Option } from "@commander-js/extra-typings";
import { shell } from "../api/shell.js";

export const createShellCommand = () => {
    return new Command("shell")
        .option("--command <command>", "shell command to run", "/bin/sh")
        .addOption(
            new Option(
                "-c, --config <config>",
                "path to the configuration file",
            )
                .argParser<string[]>((value, prev) => prev.concat([value]))
                .default(
                    [] as string[],
                    "the configuration file of the project",
                ),
        )
        .option("--run-as-root", "run as root user", false)
        .action(async (options) => {
            const { command, config, runAsRoot } = options;

            await shell({ command, config, runAsRoot });
        });
};
