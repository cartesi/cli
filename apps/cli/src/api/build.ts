import chalk from "chalk";
import fs from "fs-extra";
import { Listr, type ListrTask } from "listr2";
import path from "node:path";
import tmp from "tmp";
import { getContextPath } from "../base.js";
import {
    buildDirectory,
    buildDocker,
    buildEmpty,
    buildNone,
    buildTar,
} from "../builder/index.js";
import type { Config, DriveConfig, ImageInfo } from "../config/index.js";
import { bootMachine } from "../machine.js";
import {
    type ConfigOptions,
    listrRenderer,
    type ProgressOptions,
    resolveConfig,
} from "./types.js";

export type BuildOptions = ConfigOptions &
    ProgressOptions & {
        /**
         * Keep intermediate files, used for debugging.
         * @default false
         */
        debug?: boolean;

        /**
         * Only build the drives, do not boot the machine.
         * @default false
         */
        drivesOnly?: boolean;
    };

export type BuildResult = {
    /** Application configuration used by the build. */
    config: Config;

    /** Directory where the drives and the machine snapshot were written to. */
    destination: string;

    /** Information of the docker image used to build the root drive, if any. */
    imageInfo?: ImageInfo;
};

// context for Listr build tasks
type BuildContext = {
    config: Config;
    debug: boolean;
    destination: string;
    imageInfo?: ImageInfo;
};

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

/**
 * Build the application, by building the Cartesi machine drives, configuring a
 * machine and booting it, so a machine snapshot is created at `.cartesi/image`.
 *
 * Drives are built relative to the current working directory, so are the
 * configuration files, if provided as paths.
 *
 * @param options build options
 * @returns configuration used and location of the build artifacts
 */
export const build = async (
    options: BuildOptions = {},
): Promise<BuildResult> => {
    const { debug = false, drivesOnly = false, progress = "silent" } = options;

    // clean up temp files we create along the process
    tmp.setGracefulCleanup();

    // get application configuration, written inline or read from a file
    const config = await resolveConfig(options.config, "build");

    // destination directory for image and intermediate files
    const destination = path.resolve(getContextPath());

    // prepare context directory
    await fs.emptyDir(destination); // XXX: make it less error prone

    // build context
    const ctx: BuildContext = {
        config,
        debug,
        destination,
        imageInfo: undefined,
    };

    // tasks to build drives
    const driveTasks = Object.entries(config.drives).map(([name, drive]) =>
        buildDriveTask(name, drive),
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
        { ctx, renderer: listrRenderer(progress) },
    );
    const result = await builds.run();

    // if only build drives, quit here
    if (drivesOnly) {
        return { config, destination, imageInfo: result.imageInfo };
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
            stdio: progress === "silent" ? "pipe" : "inherit",
        },
    );

    // make snapshot readable by all users, because cartesi-machine sets to 600
    await fs.chmod(path.join(destination, "image"), 0o755);

    return { config, destination, imageInfo: result.imageInfo };
};
