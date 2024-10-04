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
import { Config, DriveConfig } from "../config.js";
import { execaDockerFallback } from "../exec.js";

type ImageInfo = {
    cmd: string[];
    entrypoint: string[];
    env: string[];
    workdir: string;
};

type DriveResult_ = {
    filename: string;
    imageInfo?: ImageInfo;
};

type DriveResult = void;

const buildDrive = async (
    name: string,
    drive: DriveConfig,
    sdkImage: string,
    destination: string,
): Promise<void> => {
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

const bootMachine = async (
    config: Config,
    info: ImageInfo | undefined,
    sdkImage: string,
    destination: string,
) => {
    const { machine } = config;
    const { assertRollingTemplate, maxMCycle, noRollup, ramLength, ramImage } =
        machine;

    // list of environment variables of docker image
    const env = info?.env ?? [];
    const envs = env.map(
        (variable) => `--append-entrypoint="export ${variable}"`,
    );

    // bootargs from config string array
    const bootargs = machine.bootargs.map(
        (arg) => `--append-bootargs="${arg}"`,
    );

    // entrypoint from config or image info (Docker ENTRYPOINT + CMD)
    const entrypoint =
        machine.entrypoint ?? // takes priority
        (info ? [...info.entrypoint, ...info.cmd].join(" ") : undefined); // ENTRYPOINT and CMD as a space separated string

    if (!entrypoint) {
        throw new Error("Undefined machine entrypoint");
    }

    const flashDrives = Object.entries(config.drives).map(([label, drive]) => {
        const { format, mount, shared, user } = drive;
        // TODO: filename should be absolute dir inside docker container
        const filename = `${label}.${format}`;
        const vars = [`label:${label}`, `filename:${filename}`];
        if (mount) {
            vars.push(`mount:${mount}`);
        }
        if (user) {
            vars.push(`user:${user}`);
        }
        if (shared) {
            vars.push("shared");
        }
        // don't specify start and length
        return `--flash-drive=${vars.join(",")}`;
    });

    // command to change working directory if WORKDIR is defined
    const command = "cartesi-machine";
    const args = [
        ...bootargs,
        ...envs,
        ...flashDrives,
        `--ram-image=${ramImage}`,
        `--ram-length=${ramLength}`,
        "--final-hash",
        "--store=image",
        `--append-entrypoint="${entrypoint}"`,
    ];
    if (info?.workdir) {
        args.push(`--append-init="WORKDIR=${info.workdir}"`);
    }
    if (noRollup) {
        args.push("--no-rollup");
    }
    if (maxMCycle) {
        args.push(`--max-mcycle=${maxMCycle.toString()}`);
    }
    if (assertRollingTemplate) {
        args.push("--assert-rolling-template");
    }

    return execaDockerFallback(command, args, {
        cwd: destination,
        image: sdkImage,
    });
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
        // const imageInfo = root.imageInfo;
        const imageInfo = undefined;

        // path of machine snapshot
        const snapshotPath = this.getContextPath("image");

        // create machine snapshot
        await bootMachine(config, imageInfo, config.sdk, destination);

        await fs.chmod(snapshotPath, 0o755);
    }
}
