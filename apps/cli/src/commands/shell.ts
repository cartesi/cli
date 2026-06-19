import { Command } from "@commander-js/extra-typings";
import { ExecaError } from "execa";
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

            // boot machine
            try {
                await bootMachine(
                    config,
                    undefined,
                    { interactive: true }, // start with interactive mode on
                    {
                        cwd: destination,
                        stdio: "inherit",
                        tty: true,
                    },
                );
            } catch (error: unknown) {
                if (error instanceof ExecaError) {
                    // just continue gracefully
                    if (error.exitCode === 130) {
                        return;
                    }
                    throw error;
                }
            }
        });
};
