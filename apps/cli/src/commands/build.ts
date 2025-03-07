import { Command } from "@commander-js/extra-typings";
import fs from "fs-extra";
import path from "path";
import tmp from "tmp";
import { getApplicationConfig, getContextPath } from "../base.js";
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

export const createBuildCommand = () => {
    return new Command("build")
        .description(
            "Build application by building Cartesi machine drives, configuring a machine and booting it.",
        )
        .option(
            "-c, --config <config>",
            "path to the configuration file",
            "cartesi.toml",
        )
        .option("-d, --drives-only", "only build drives, do not boot machine")
        .action(async ({ config, drivesOnly }) => {
            // clean up temp files we create along the process
            tmp.setGracefulCleanup();

            // get application configuration from 'cartesi.toml'
            const c = getApplicationConfig(config);

            // destination directory for image and intermediate files
            const destination = path.resolve(getContextPath());

            // prepare context directory
            await fs.emptyDir(destination); // XXX: make it less error prone

            // start build of all drives simultaneously
            const results = Object.entries(c.drives).reduce<
                Record<string, Promise<DriveResult>>
            >((acc, [name, drive]) => {
                acc[name] = buildDrive(name, drive, c.sdk, destination);
                return acc;
            }, {});

            // await for all drives to be built
            await Promise.all(Object.values(results));

            if (drivesOnly) {
                // only build drives, so quit here
                return;
            }

            // get image info of root drive
            const root = await results["root"];
            const imageInfo = root || undefined;

            // path of machine snapshot
            const snapshotPath = getContextPath("image");

            // create machine snapshot
            await bootMachine(c, imageInfo, destination);

            await fs.chmod(snapshotPath, 0o755);
        });
};
