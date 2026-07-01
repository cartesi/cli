import { Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import fs from "fs-extra";
import { Listr, type ListrTask } from "listr2";
import path from "node:path";
import tmp from "tmp";
import { getApplicationConfig, getContextPath } from "../base.js";
import {
    buildDirectory,
    buildDocker,
    buildEmpty,
    buildNone,
    buildTar,
} from "../builder/index.js";
import type { Config, DriveConfig, ImageInfo } from "../config.js";
import { bootMachine } from "../machine.js";

// context for Listr build tasks
interface BuildContext {
    config: Config;
    debug: boolean;
    destination: string;
    imageInfo?: ImageInfo;
}

const buildDriveTask = (
    name: string,
    drive: DriveConfig,
): ListrTask<BuildContext> => ({
    title: `Building drive ${chalk.cyan(name)}`,
    task: async (ctx, task) => {
        const { config, debug, destination } = ctx;
        const sdk = config.sdk;
        const reporter = (line: string) => {
            task.output = line;
        };

        switch (drive.builder) {
            case "directory": {
                await buildDirectory(
                    name,
                    drive,
                    sdk,
                    destination,
                    debug,
                    reporter,
                );
                break;
            }
            case "docker": {
                const imageInfo = await buildDocker(
                    name,
                    drive,
                    sdk,
                    destination,
                    debug,
                    reporter,
                );
                if (imageInfo && name === "root") {
                    // only set image info for root drive
                    ctx.imageInfo = imageInfo;
                }
                break;
            }
            case "empty": {
                await buildEmpty(name, drive, sdk, destination);
                break;
            }
            case "tar": {
                await buildTar(name, drive, sdk, destination, reporter);
                break;
            }
            case "none": {
                await buildNone(name, drive, destination);
                break;
            }
        }
        task.title = `Build drive ${chalk.cyan(name)}`;
    },
});

export const createBuildCommand = () => {
    return new Command("build")
        .description(
            "Build application by building Cartesi machine drives, configuring a machine and booting it.",
        )
        .option(
            "-c, --config <config>",
            "path to the configuration file",
            (value, prev) => prev.concat([value]),
            ["cartesi.toml"],
        )
        .addOption(
            new Option(
                "--debug",
                "enable debug mode (do not remove intermediate files)",
            )
                .default(false)
                .hideHelp(),
        )
        .option("-d, --drives-only", "only build drives, do not boot machine")
        .option("-v, --verbose", "verbose output", false)
        .action(async (options) => {
            const { debug, drivesOnly, verbose } = options;

            // clean up temp files we create along the process
            tmp.setGracefulCleanup();

            // get application configuration from 'cartesi.toml'
            const config = getApplicationConfig(options.config);

            // destination directory for image and intermediate files
            const destination = path.resolve(getContextPath());

            // prepare context directory
            await fs.emptyDir(destination); // XXX: make it less error prone

            // build context
            const ctx = {
                config,
                debug,
                destination,
                verbose,
                imageInfo: undefined,
            };

            // tasks to build drives
            const driveTasks = Object.entries(config.drives).map(
                ([name, drive]) => buildDriveTask(name, drive),
            );

            const builds = new Listr(
                [
                    {
                        title: "Build drives",
                        task: async (_ctx, task) => {
                            return task.newListr(driveTasks, {
                                concurrent: true,
                                rendererOptions: {
                                    collapseSubtasks: false,
                                },
                                ctx,
                            });
                        },
                    },
                ],
                { ctx, renderer: verbose ? "verbose" : "default" },
            );
            const result = await builds.run();

            // if only build drives, quit here
            if (drivesOnly) {
                return;
            }

            // create machine snapshot
            await bootMachine(
                config,
                result.imageInfo,
                {
                    finalHash: true,
                    store: "image",
                },
                {
                    cwd: destination,
                    stdio: "inherit",
                },
            );

            // make snapshot readable by all users, because cartesi-machine sets to 600
            await fs.chmod(path.join(destination, "image"), 0o755);
        });
};
