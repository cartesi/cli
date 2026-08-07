import { ExecaError } from "execa";
import fs from "fs-extra";
import path from "node:path";
import { getContextPath } from "../base.js";
import { bootMachine } from "../machine.js";
import { type ConfigOptions, resolveConfig } from "./types.js";

export type ShellOptions = ConfigOptions & {
    /**
     * Shell command to run inside the machine.
     * @default "/bin/sh"
     */
    command?: string;

    /**
     * Run as the root user.
     * @default false
     */
    runAsRoot?: boolean;
};

/**
 * Boot the machine of the application in interactive mode, running a shell (or
 * any other command) inside it. Requires the drives to be built already, by
 * {@link build}.
 *
 * The machine is attached to the terminal of the calling process.
 *
 * @param options shell options
 */
export const shell = async (options: ShellOptions = {}): Promise<void> => {
    const { command = "/bin/sh", runAsRoot = false } = options;

    // get application configuration, from a Config object or 'cartesi.toml'
    const config = resolveConfig(options.config);

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

    const machine = {
        ...config.machine,

        // create shell entrypoint
        entrypoint: command,

        // run as root if flag is set
        user: runAsRoot ? "root" : undefined,
    };

    // boot machine
    try {
        await bootMachine(
            { ...config, machine },
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
            // exit code of a shell terminated by SIGINT, just return gracefully
            if (error.exitCode === 130) {
                return;
            }
        }
        throw error;
    }
};
