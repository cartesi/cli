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
        config: Flags.file({
            char: "c",
            default: "cartesi.toml",
            summary: "path to the configuration file",
        }),
        "run-as-root": Flags.boolean({
            description: "run as root user",
            default: false,
        }),
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(Shell);

        // get application configuration from 'cartesi.toml'
        const config = this.getApplicationConfig(flags.config);

        // destination directory for image and intermediate files
        const destination = path.resolve(this.getContextPath());

        // use pre-existing image or build dapp image
        // TODO: check if all drives exist
        const ext2Path = this.getContextPath("root.ext2");
        if (!fs.existsSync(ext2Path)) {
            throw new Error(
                `machine not built, run '${this.config.bin} build'`,
            );
        }

        // create shell entrypoint
        const info: ImageInfo = {
            cmd: [],
            entrypoint: ["/bin/bash"],
            env: [],
            workdir: "/",
        };

        // start with interactive mode on
        config.machine.interactive = true;

        /* why this?
        if (!(await lookpath("stty"))) {
            args.push("-i");
        } else {
            args.push("-it");
        }
        */

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
