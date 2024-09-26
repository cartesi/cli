import { Flags } from "@oclif/core";
import { spawn } from "child_process";
import { execa, ExecaError, Options } from "execa";
import fs from "fs-extra";
import path from "path";
import { finished } from "stream/promises";
import tmp from "tmp";
import { BaseCommand } from "../baseCommand.js";
import {
    Config,
    DirectoryDriveConfig,
    DockerDriveConfig,
    DriveConfig,
    EmptyDriveConfig,
    ExistingDriveConfig,
    getDriveFormat,
    TarDriveConfig,
} from "../config.js";

type ImageBuildOptions = Pick<
    DockerDriveConfig,
    "dockerfile" | "tags" | "target"
>;

type ImageInfo = {
    cmd: string[];
    entrypoint: string[];
    env: string[];
    workdir: string;
};

type DriveResult = {
    filename: string;
    imageInfo?: ImageInfo;
};

/**
 * Calls execa and falls back to docker run if command (on the host) fails
 * @param command command to be executed
 * @param args arguments to be passed to the command
 * @param options execution options
 * @returns return of execa
 */
type OptionsDockerFallback = Options & { image?: string };
const execaDockerFallback = async (
    command: string,
    args: readonly string[],
    options: OptionsDockerFallback,
) => {
    try {
        return await execa(command, args, options);
    } catch (error) {
        if (error instanceof ExecaError) {
            if (error.code === "ENOENT" && options.image) {
                return await execa(
                    "docker",
                    [
                        "run",
                        "--volume",
                        `${options.cwd}:/work`,
                        "--workdir",
                        "/work",
                        options.image,
                        command,
                        ...args,
                    ],
                    options,
                );
            }
        }
        throw error;
    }
};

/**
 * Build Docker image (linux/riscv64). Returns image id.
 */
const buildImage = async (options: ImageBuildOptions): Promise<string> => {
    const { dockerfile, tags, target } = options;
    const buildResult = tmp.tmpNameSync();
    const args = [
        "buildx",
        "build",
        "--file",
        dockerfile,
        "--load",
        "--iidfile",
        buildResult,
    ];

    // set tags for the image built
    args.push(...tags.map((tag) => ["--tag", tag]).flat());

    if (target) {
        args.push("--target", target);
    }

    await execa("docker", [...args, process.cwd()], { stdio: "inherit" });
    return fs.readFileSync(buildResult, "utf8");
};

/**
 * Query the image using docker image inspect
 * @param image image id or name
 * @returns Information about the image
 */
const getImageInfo = async (image: string): Promise<ImageInfo> => {
    const { stdout: jsonStr } = await execa("docker", [
        "image",
        "inspect",
        image,
    ]);
    // parse image info from docker inspect output
    const [imageInfo] = JSON.parse(jsonStr);

    // validate image architecture (must be riscv64)
    if (imageInfo["Architecture"] !== "riscv64") {
        throw new Error(
            `Invalid image Architecture: ${imageInfo["Architecture"]}. Expected riscv64`,
        );
    }

    const info: ImageInfo = {
        cmd: imageInfo["Config"]["Cmd"] ?? [],
        entrypoint: imageInfo["Config"]["Entrypoint"] ?? [],
        env: imageInfo["Config"]["Env"] || [],
        workdir: imageInfo["Config"]["WorkingDir"],
    };

    return info;
};

const buildDirectoryDrive = async (
    name: string,
    drive: DirectoryDriveConfig,
    sdkImage: string,
    destination: string,
): Promise<DriveResult> => {
    const filename = `${name}.${drive.format}`;
    const blockSize = 4096; // fixed at 4k
    const extraBlocks = Math.ceil(drive.extraSize / blockSize);
    const extraSize = `+${extraBlocks}`;

    // copy directory to destination
    const dest = path.join(destination, name);
    await fs.mkdirp(dest);
    await fs.copy(drive.directory, dest);

    try {
        switch (drive.format) {
            case "ext2": {
                const command = "xgenext2fs";
                const args = [
                    "--block-size",
                    blockSize.toString(),
                    "--faketime",
                    "--root",
                    name,
                    "--readjustment",
                    extraSize,
                ];
                await execaDockerFallback(command, args, {
                    cwd: destination,
                    image: sdkImage,
                });
                break;
            }
            case "ext4": {
                const seed = "00000000-0000-0000-0000-000000000001";
                const command = "mke2fs";
                const PATH = "/opt/homebrew/opt/e2fsprogs/sbin";
                const args = [
                    "-b",
                    blockSize.toString(),
                    "-U",
                    "clear",
                    "-E",
                    `hash_seed=${seed}`,
                    "-d",
                    name,
                    "-t",
                    drive.format,
                    filename,
                ];
                const env = { PATH, SOURCE_DATE_EPOCH: "0" };
                await execaDockerFallback(command, args, {
                    cwd: destination,
                    env,
                    image: sdkImage,
                });
                break;
            }
            case "sqfs": {
                const compression = "lzo"; // make customizable? default is gzip
                const command = "mksquashfs";
                const args = [
                    "-all-time",
                    "0",
                    "-all-root", // XXX: should we use this?
                    "-noappend",
                    "-comp",
                    compression,
                    "-no-progress",
                    name,
                    filename,
                ];
                await execaDockerFallback(command, args, {
                    cwd: destination,
                    image: sdkImage,
                });
            }
        }
    } finally {
        // delete copied
        await fs.remove(dest);
    }
    return { filename: path.join(destination, filename) };
};

const exportImageTar = async (
    cwd: string,
    inputFile: string,
    outputFile: string,
) => {
    const crane = spawn("crane", ["export", "-", "-"]);
    const input = fs.createReadStream(path.join(cwd, inputFile));
    const output = fs.createWriteStream(path.join(cwd, outputFile));
    // pipeline(input, crane, output)
    input.pipe(crane.stdin);
    crane.stdout.pipe(output);
    console.log(cwd, inputFile, outputFile);
    await finished(output);
    return finished(input);

    /*
    return pipeline(
        createReadStream(path.join(cwd, inputFile)),
        execa("crane", ["export", "-", "-"]).duplex(),
        createWriteStream(path.join(cwd, outputFile)),
    );
    *.

    /*return execa("crane", ["export", "-", "-"], {
        cwd,
        inputFile: path.join(cwd, inputFile),
        outputFile: path.join(cwd, outputFile),
        shell: true,
    });*/
};

const buildDockerDrive = async (
    name: string,
    drive: DockerDriveConfig,
    sdkImage: string,
    destination: string,
): Promise<DriveResult> => {
    const { format } = drive;

    const ocitar = `${name}.oci.tar`;
    const tar = `${name}.tar`;
    const filename = `${name}.${format}`;

    // use pre-existing image or build docker image
    const image = drive.image || (await buildImage(drive));

    // get image info
    const imageInfo = await getImageInfo(image);

    try {
        // create OCI Docker tarball from Docker image
        await execa("docker", ["image", "save", image, "-o", ocitar], {
            cwd: destination,
        });

        // create rootfs tar from OCI tar
        await exportImageTar(destination, ocitar, tar);

        switch (format) {
            case "ext2":
            case "ext4": {
                // create ext2 or ext4
                await tarToExt(tar, filename, format, drive.extraSize, {
                    cwd: destination,
                    image: sdkImage,
                });
                break;
            }
            case "sqfs": {
                const compression = "lzo"; // make customizable? default is gzip
                const command = "mksquashfs";
                const args = [
                    "-tar",
                    "-all-time",
                    "0",
                    "-all-root", // XXX: should we use this?
                    "-noappend",
                    "-comp",
                    compression,
                    "-no-progress",
                    filename,
                ];
                await execaDockerFallback(command, args, {
                    cwd: destination,
                    image: sdkImage,
                    inputFile: tar,
                });
                break;
            }
        }
    } finally {
        // delete intermediate files
        // await fs.remove(path.join(destination, gnuTar));
        // await fs.remove(path.join(destination, tar));
    }

    return {
        filename: path.join(destination, filename),
        imageInfo,
    };
};

const buildEmptyDrive = async (
    name: string,
    drive: EmptyDriveConfig,
    sdkImage: string,
    destination: string,
): Promise<DriveResult> => {
    const filename = `${name}.${drive.format}`;
    switch (drive.format) {
        case "ext2": {
            const blockSize = 4096; // fixed at 4k
            const size = Math.ceil(drive.size / blockSize); // size in blocks
            const command = "xgenext2fs";
            const args = [
                "--block-size",
                blockSize.toString(),
                "--faketime",
                "--size-in-blocks",
                size.toString(),
                filename,
            ];
            await execaDockerFallback(command, args, {
                cwd: destination,
                image: sdkImage,
            });
            break;
        }
        case "ext4": {
            const blockSize = 4096; // fixed at 4k
            const size = Math.ceil(drive.size / blockSize); // size in blocks
            const seed = "00000000-0000-0000-0000-000000000001";
            const command = "mke2fs";
            const PATH = "/opt/homebrew/opt/e2fsprogs/sbin";
            const args = [
                "-b",
                blockSize.toString(),
                "-U",
                "clear",
                "-E",
                `hash_seed=${seed}`,
                "-t",
                drive.format,
                filename,
                size.toString(),
            ];
            const env = { PATH, SOURCE_DATE_EPOCH: "0" };
            await execaDockerFallback(command, args, {
                cwd: destination,
                env,
                image: sdkImage,
            });
            break;
        }

        case "raw": {
            await fs.writeFile(
                path.join(destination, filename),
                Buffer.alloc(drive.size),
            );
            break;
        }
    }
    return { filename: path.join(destination, filename) };
};

const tarToExt = async (
    input: string,
    output: string,
    format: "ext2" | "ext4",
    extraSize: number,
    options: OptionsDockerFallback,
) => {
    const blockSize = 4096; // fixed at 4k
    const extraBlocks = Math.ceil(extraSize / blockSize);
    // const extraSize = `+${extraBlocks}`;

    const seed = "00000000-0000-0000-0000-000000000001";
    const command = "mke2fs";
    const PATH = "/opt/homebrew/opt/e2fsprogs/sbin";
    const args = [
        "-b",
        blockSize.toString(),
        "-U",
        "clear",
        "-E",
        `hash_seed=${seed}`,
        "-d",
        input,
        "-t",
        format,
        output,
    ];
    const env = { ...options.env, PATH, SOURCE_DATE_EPOCH: "0" };
    return execaDockerFallback(command, args, { ...options, env });
};

const buildTarDrive = async (
    name: string,
    drive: TarDriveConfig,
    sdkImage: string,
    destination: string,
): Promise<DriveResult> => {
    const tar = `${name}.tar`;
    const filename = `${name}.${drive.format}`;

    // copy input tar to destination directory (with drive name)
    await fs.copy(drive.filename, path.join(destination, tar));

    switch (drive.format) {
        case "ext2":
        case "ext4": {
            await tarToExt(tar, filename, drive.format, drive.extraSize, {
                cwd: destination,
                image: sdkImage,
            });
            break;
        }
        case "sqfs": {
            const compression = "lzo"; // make customizable? default is gzip
            const command = "mksquashfs";
            const args = [
                "-tar",
                "-all-time",
                "0",
                "-all-root", // XXX: should we use this?
                "-noappend",
                "-comp",
                compression,
                "-no-progress",
                filename,
            ];
            await execaDockerFallback(command, args, {
                cwd: destination,
                image: sdkImage,
                inputFile: tar,
            });
            break;
        }
    }
    return { filename: path.join(destination, filename) };
};

const buildExistingDrive = async (
    name: string,
    drive: ExistingDriveConfig,
    destination: string,
): Promise<DriveResult> => {
    // no need to build, drive already exists
    const src = drive.filename;
    const format = getDriveFormat(src);
    const filename = path.join(destination, `${name}.${format}`);

    // just copy it
    await fs.copyFile(src, filename);
    return { filename };
};

const buildDrive = async (
    name: string,
    drive: DriveConfig,
    sdkImage: string,
    destination: string,
): Promise<DriveResult> => {
    switch (drive.builder) {
        case "directory": {
            return buildDirectoryDrive(name, drive, sdkImage, destination);
        }
        case "docker": {
            return buildDockerDrive(name, drive, sdkImage, destination);
        }
        case "empty": {
            return buildEmptyDrive(name, drive, sdkImage, destination);
        }
        case "tar": {
            return buildTarDrive(name, drive, sdkImage, destination);
        }
        case "none": {
            return buildExistingDrive(name, drive, destination);
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
        const imageInfo = root.imageInfo;

        // path of machine snapshot
        const snapshotPath = this.getContextPath("image");

        // create machine snapshot
        await bootMachine(config, imageInfo, config.sdk, destination);

        await fs.chmod(snapshotPath, 0o755);
    }
}
