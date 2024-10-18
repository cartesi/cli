import { Flags } from "@oclif/core";
import fs from "fs-extra";
import path from "path";
import tmp from "tmp";
import { BaseCommand } from "../baseCommand.js";
import {
    buildDirectory,
    buildDocker,
    buildEmpty,
    buildNone,
    buildTar,
} from "../builder/index.js";
import { DriveConfig, DriveResult } from "../config.js";
import { bootMachine } from "../machine.js";

const buildDrive = async (
    name: string,
    drive: DriveConfig,
    sdkImage: string,
    destination: string,
): Promise<DriveResult> => {
    switch (drive.builder) {
        case "directory": {
            return buildDirectory(name, drive, sdkImage, destination);
        }
        case "docker": {
            return buildDocker(name, drive, sdkImage, destination);
        }
        case "empty": {
            return buildEmpty(name, drive, sdkImage, destination);
        }
        case "tar": {
            return buildTar(name, drive, sdkImage, destination);
        }
        case "none": {
            return buildNone(name, drive, destination);
        }
    }
};

export default class Build extends BaseCommand<typeof Build> {
    static summary = "Build application.";

    static description =
        "Build application by building Cartesi machine drives, configuring a machine and booting it";

    static examples = ["<%= config.bin %> <%= command.id %>"];

    static flags = {
        config: Flags.file({
            char: "c",
            default: "cartesi.toml",
            summary: "path to the configuration file",
        }),
        "drives-only": Flags.boolean({
            default: false,
            summary: "only build drives",
        }),
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(Build);

        // clean up temp files we create along the process
        tmp.setGracefulCleanup();

        // get application configuration from 'cartesi.toml'
        const config = this.getApplicationConfig(flags.config);

        // destination directory for image and intermediate files
        const destination = path.resolve(this.getContextPath());

        // prepare context directory
        await fs.emptyDir(destination); // XXX: make it less error prone

        // start build of all drives simultaneously
        const results = Object.entries(config.drives).reduce<
            Record<string, Promise<DriveResult>>
        >((acc, [name, drive]) => {
            acc[name] = buildDrive(name, drive, config.sdk, destination);
            return acc;
        }, {});

        // await for all drives to be built
        await Promise.all(Object.values(results));

        if (flags["drives-only"]) {
            // only build drives, so quit here
            return;
        }

        // get image info of root drive
        const root = await results["root"];
        const imageInfo = root || undefined;

        // path of machine snapshot
        const snapshotPath = this.getContextPath("image");

        // create machine snapshot
        await bootMachine(config, imageInfo, destination);

        await fs.chmod(snapshotPath, 0o755);
    }
}
