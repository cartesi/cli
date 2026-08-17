import { Command } from "@commander-js/extra-typings";
import fs from "fs-extra";
import path from "node:path";
import { getApplicationConfig, getContextPath } from "../base.js";
import { bootMachine } from "../machine.js";

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
            const { command, runAsRoot } = options;

            // get application configuration from 'cartesi.toml'
            const config = getApplicationConfig(options.config);

            // destination directory for image and intermediate files
            const destination = path.resolve(getContextPath());

            // check if all drives are built
            for (const [name, drive] of Object.entries(config.drives)) {
                const filename = `${name}.${drive.format}`;
                const pathname = getContextPath(filename);
                if (!fs.existsSync(pathname)) {
                    throw new Error(`drive '${name}' not built, run 'build'`);
                }
            }

            // create shell entrypoint
            config.machine.entrypoint = command;

            // run as root if flag is set
            config.machine.user = runAsRoot ? "root" : undefined;

            // boot machine, in interactive mode
            const { exitCode } = await bootMachine(config, undefined, {
                cwd: destination,
                interactive: true,
                reporter: (line) => console.error(line),
            });

            // 130 is the shell being interrupted, which is not a failure
            if (exitCode !== 0 && exitCode !== 130) {
                throw new Error(`Machine stopped with exit code ${exitCode}`);
            }
        });
};
