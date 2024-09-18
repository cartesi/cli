import { Args, Flags } from "@oclif/core";
import fs from "fs-extra";
import path from "path";
import { BaseCommand } from "../baseCommand.js";
import { ImageInfo } from "../config.js";
import { bootMachine } from "../machine.js";

export default class Shell extends BaseCommand<typeof Shell> {
    static description = "Start a shell in cartesi machine of application";

    static examples = ["<%= config.bin %> <%= command.id %>"];

    static args = {
        image: Args.string({
            description: "image ID|name",
            required: false,
        }),
    };

    static flags = {
        command: Flags.string({
            default: "/bin/sh",
            description: "shell command to run",
            summary: "shell to run",
        }),
        config: Flags.file({
            char: "c",
            default: "cartesi.toml",
            summary: "path to the configuration file",
        }),
        "run-as-root": Flags.boolean({
            default: false,
            description: "run as root user",
            summary: "run the cartesi machine as the root user",
        }),
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(Shell);

        // get application configuration from 'cartesi.toml'
        const config = this.getApplicationConfig(flags.config);

        // destination directory for image and intermediate files
        const destination = path.resolve(this.getContextPath());

        // check if all drives are built
        for (const [name, drive] of Object.entries(config.drives)) {
            const filename = `${name}.${drive.format}`;
            const pathname = this.getContextPath(filename);
            if (!fs.existsSync(pathname)) {
                throw new Error(
                    `drive '${name}' not built, run '${this.config.bin} build'`,
                );
            }
        }

        // create shell entrypoint
        const info: ImageInfo = {
            cmd: [],
            entrypoint: [this.flags.command],
            env: [],
            workdir: "/",
        };

        // start with interactive mode on
        config.machine.interactive = true;

        // interactive mode can't have final hash
        config.machine.finalHash = false;

        // do not store machine in interactive mode
        config.machine.store = undefined;

        // run as root if flag is set
        config.machine.user = flags["run-as-root"] ? "root" : undefined;

        // boot machine
        await bootMachine(config, info, destination);
    }
}
