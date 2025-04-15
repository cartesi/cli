import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import { execa } from "execa";
import fs from "fs-extra";
import path from "path";
import tmp from "tmp";
import { getApplicationConfig, getContextPath } from "../../base.js";
import {
    buildDirectory,
    buildDocker,
    buildEmpty,
    buildNone,
    buildTar,
} from "../../builder/index.js";
import { DriveConfig, DriveResult } from "../../config.js";
import { bootMachine } from "../../machine.js";
import { Service } from "../../service.js";

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

const coprocessorCarizeServices: Service[] = [
    {
        name: "carize",
        file: "coprocessor/docker-compose-carize.yaml",
        waitTitle: `${chalk.cyan("Generating Car files.....")}`,
        errorTitle: `${chalk.red("Error cenerating car files")}`,
    },
];

const runCarizeTool = async () => {
    // path of the tool instalation
    const binPath = path.join(
        path.dirname(new URL(import.meta.url).pathname),
        "../..",
    );

    const dataPath = path.resolve(process.cwd(), ".cartesi/image");
    const outputPath = path.resolve(process.cwd(), ".cartesi/artifacts");

    const env: NodeJS.ProcessEnv = {
        CARIZE_DATA: dataPath,
        CARIZE_OUTPUT: outputPath,
    };

    // build a list of unique compose files
    const composeFiles = [
        ...new Set(coprocessorCarizeServices.map(({ file }) => file)),
    ];

    // create the "--file <file>" list
    const files = composeFiles
        .map((f) => ["--file", path.join(binPath, "compose", f)])
        .flat();

    const compose_args = [
        "compose",
        ...files,
        "--project-name",
        `coprocessor_carize`,
        "--progress",
        "quiet",
    ];

    const up_args = ["--attach", "carize"];

    // XXX: need this handler, so SIGINT can still call the finally block below
    process.on("SIGINT", () => {});

    try {
        await execa("docker", [...compose_args, "up", ...up_args], {
            env,
            stdio: "inherit",
        });
    } catch (e: unknown) {
        // 130 is a graceful shutdown, so we can swallow it
        if ((e as any).exitCode !== 130) {
            throw e;
        }
    } finally {
        await execa("docker", [...compose_args, "down", "--volumes"], {
            env,
            stdio: "inherit",
        });
    }
};

export const createBuildCommand = () => {
    return new Command("build")
        .description(
            "Build application for Coprocessor framework by building Cartesi machine drives, configuring a machine, booting it and finaly generating car files.",
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

            await runCarizeTool();
        });
};
