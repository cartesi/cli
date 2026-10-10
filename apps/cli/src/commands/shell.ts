import { Command } from "@commander-js/extra-typings";
import { shell } from "../api/shell.js";

export const createShellCommand = () => {
    return new Command("shell")
        .option("--command <command>", "shell command to run", "/bin/sh")
        .option(
            "-c, --config <config>",
            "path to the configuration file",
            (value, prev) => prev.concat([value]),
            ["cartesi.toml"],
        )
        .option("--run-as-root", "run as root user", false)
        .action(async (options) => {
            const { command, config, runAsRoot } = options;

            await shell({ command, config, runAsRoot });
        });
};
