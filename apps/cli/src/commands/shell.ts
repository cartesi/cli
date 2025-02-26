import { Command } from "@commander-js/extra-typings";
import fs from "fs-extra";
import path from "path";
import { getApplicationConfig, getContextPath } from "../base.js";
import { ImageInfo } from "../config.js";
import { bootMachine } from "../machine.js";

export const registerShellCommand = (program: Command) => {
    program
        .command("shell")
        .argument("[image]", "image ID|name")
        .option("--command <command>", "shell command to run", "/bin/sh")
        .option(
            "-c, --config <config>",
            "path to the configuration file",
            "cartesi.toml",
        )
        .option("--run-as-root", "run as root user", false)
        .action(async (image, { command, config, runAsRoot }) => {
            // get application configuration from 'cartesi.toml'
            const c = getApplicationConfig(config);

            // destination directory for image and intermediate files
            const destination = path.resolve(getContextPath());

            // check if all drives are built
            for (const [name, drive] of Object.entries(c.drives)) {
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
            c.machine.interactive = true;

            // interactive mode can't have final hash
            c.machine.finalHash = false;

            // do not store machine in interactive mode
            c.machine.store = undefined;

            // run as root if flag is set
            c.machine.user = runAsRoot ? "root" : undefined;

            // boot machine
            await bootMachine(c, info, destination);
        });
};
