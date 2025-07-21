import { Command } from "@commander-js/extra-typings";
import { ExecaError } from "execa";
import fs from "fs-extra";
import path from "node:path";
import { getApplicationConfig, getContextPath } from "../base.js";
import type { ImageInfo } from "../config.js";
import { bootMachine } from "../machine.js";

export const createShellCommand = () => {
    return new Command("shell")
        .option("--command <command>", "shell command to run", "/bin/sh")
        .option(
            "-c, --config <config>",
            "path to the configuration file",
            "cartesi.toml",
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
            const info: ImageInfo = {
                cmd: [],
                entrypoint: [command],
                env: [],
                workdir: "/",
            };

            // start with interactive mode on
            config.machine.interactive = true;

            // do not store machine in interactive mode
            config.machine.store = undefined;

            // run as root if flag is set
            config.machine.user = runAsRoot ? "root" : undefined;

            // boot machine
            try {
                await bootMachine(config, info, {
                    cwd: destination,
                    stdio: "inherit",
                });
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
