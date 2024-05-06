import { Flags } from "@oclif/core";
import bytes from "bytes";
import { execa } from "execa";
import fs from "fs-extra";
import path from "path";
import semver from "semver";
import tar from "tar-stream";
import tmp from "tmp";

import { BaseCommand } from "../baseCommand.js";
import { createConfig } from "../runc.js";
import { DEFAULT_TEMPLATES_BRANCH } from "./create.js";

type ImageBuildOptions = {
    target?: string;
};

export type ImageInfo = {
    cmd: string[];
    dataSize: string;
    entrypoint: string[];
    env: string[];
    ramSize: string;
    sdkVersion: string;
    workdir: string;
};

type DriveType = "ext2" | "sqfs";

const CARTESI_LABEL_PREFIX = "io.cartesi.rollups";
const CARTESI_LABEL_RAM_SIZE = `${CARTESI_LABEL_PREFIX}.ram_size`;
const CARTESI_LABEL_DATA_SIZE = `${CARTESI_LABEL_PREFIX}.data_size`;
const CARTESI_DEFAULT_RAM_SIZE = "128Mi";

const CARTESI_LABEL_SDK_VERSION = `${CARTESI_LABEL_PREFIX}.sdk_version`;
const CARTESI_DEFAULT_SDK_VERSION = "0.6.0";

const CARTESI_CRUNTIME_VERSION = "0.1.0";
const CARTESI_CRUNTIME_IMAGE = `cartesi/cruntime:${CARTESI_CRUNTIME_VERSION}`;

export default class BuildApplication extends BaseCommand<
    typeof BuildApplication
> {
    static summary = "Build application.";

    static description =
        "Build application starting from a Dockerfile and ending with a snapshot of the corresponding Cartesi Machine already booted and yielded for the first time. This snapshot can be used to start a Cartesi node for the application using `run`. The process can also start from a Docker image built by the developer using `docker build` using the option `--from-image`";

    static examples = [
        "<%= config.bin %> <%= command.id %>",
        "<%= config.bin %> <%= command.id %> --from-image my-app",
    ];

    static args = {};

    static flags = {
        "from-image": Flags.string({
            summary: "skip docker build and start from this image.",
            description:
                "if the build process of the application Dockerfile needs more control the developer can build the image using the `docker build` command, and then start the build process of the Cartesi machine starting from that image.",
        }),
        target: Flags.string({
            summary: "target of docker multi-stage build.",
            description:
                "if the application Dockerfile uses a multi-stage strategy, and stage of the image to be exported as a Cartesi machine is not the last stage, use this parameter to specify the target stage.",
        }),
        "skip-snapshot": Flags.boolean({
            summary: "skip machine snapshot creation.",
            description:
                "if the developer is only interested in building the ext2 image to run sunodo shell and does not want to create the machine snapshot, this flag can be used to skip the last step of the process.",
        }),
        "drive-type": Flags.string({
            summary: "cartesi-machine flash drive type",
            description:
                "defines which drive type will be used as cartesi amchine flash-drives",
            options: ["ext2", "sqfs"],
            default: "ext2",
        }),
    };

    /**
     * Build DApp image (linux/riscv64). Returns image id.
     * @param directory path of context containing Dockerfile
     */
    private async buildImage(options: ImageBuildOptions): Promise<string> {
        const buildResult = tmp.tmpNameSync();
        this.debug(
            `building docker image and writing result to ${buildResult}`,
        );
        const args = ["buildx", "build", "--load", "--iidfile", buildResult];
        if (options.target) {
            args.push("--target", options.target);
        }

        await execa("docker", [...args, process.cwd()], { stdio: "inherit" });
        return fs.readFileSync(buildResult, "utf8");
    }

    private async getImageInfo(image: string): Promise<ImageInfo> {
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

        const labels = imageInfo["Config"]["Labels"] || {};
        const info: ImageInfo = {
            cmd: imageInfo["Config"]["Cmd"] ?? [],
            dataSize: labels[CARTESI_LABEL_DATA_SIZE] ?? "10Mb",
            entrypoint: imageInfo["Config"]["Entrypoint"] ?? [],
            env: imageInfo["Config"]["Env"] || [],
            ramSize: labels[CARTESI_LABEL_RAM_SIZE] ?? CARTESI_DEFAULT_RAM_SIZE,
            sdkVersion:
                labels[CARTESI_LABEL_SDK_VERSION] ??
                CARTESI_DEFAULT_SDK_VERSION,
            workdir: imageInfo["Config"]["WorkingDir"],
        };

        if (!info.entrypoint && !info.cmd) {
            throw new Error("Undefined image ENTRYPOINT or CMD");
        }

        // fail if using unsupported sdk version
        if (!semver.valid(info.sdkVersion)) {
            this.warn("sdk version is not a valid semver");
        } else if (semver.lt(info.sdkVersion, CARTESI_DEFAULT_SDK_VERSION)) {
            throw new Error(`Unsupported sdk version: ${info.sdkVersion} (used) < ${CARTESI_DEFAULT_SDK_VERSION} (minimum).
Update your application Dockerfile using one of the templates at https://github.com/cartesi/application-templates/tree/${DEFAULT_TEMPLATES_BRANCH}
`);
        }

        // warn for using default values
        info.sdkVersion ||
            this.warn(
                `Undefined ${CARTESI_LABEL_SDK_VERSION} label, defaulting to ${CARTESI_DEFAULT_SDK_VERSION}`,
            );

        info.ramSize ||
            this.warn(
                `Undefined ${CARTESI_LABEL_RAM_SIZE} label, defaulting to ${CARTESI_DEFAULT_RAM_SIZE}`,
            );

        // validate data size value
        if (bytes(info.dataSize) === null) {
            throw new Error(
                `Invalid ${CARTESI_LABEL_DATA_SIZE} value: ${info.dataSize}`,
            );
        }

        // XXX: validate other values

        return info;
    }

    // saves the OCI Image to a tarball
    private async createTarball(
        image: string,
        outputFilePath: string,
    ): Promise<void> {
        // create docker tarball from app image
        await execa("docker", ["image", "save", image, "-o", outputFilePath]);
    }

    // this wraps the call to the sdk image with a one-shot approach
    // the (inputPath, outputPath) signature will mount the input as a volume and copy the output with docker cp
    private async sdkRun(
        sdkImage: string,
        cmd: string[],
        inputPath: string[],
        outputPath: string,
    ): Promise<void> {
        const volumes = inputPath.map(
            (path, i) => `--volume=${path}:/tmp/input${i}`,
        );

        const createCmd = ["container", "create", ...volumes, sdkImage, ...cmd];

        const { stdout: cid } = await execa("docker", createCmd);

        await execa("docker", ["container", "start", "-a", cid], {
            stdio: "inherit",
        });

        await execa("docker", [
            "container",
            "cp",
            `${cid}:/tmp/output`,
            outputPath,
        ]);

        await execa("docker", ["container", "stop", cid]);
        await execa("docker", ["container", "rm", cid]);
    }

    // returns the command to create rootfs tarball from an OCI Image tarball
    private static createRootfsTarCommand(): string[] {
        const cmd = [
            "cat",
            "/tmp/input0",
            "|",
            "crane",
            "export",
            "-", // OCI Image from stdin
            "-", // rootfs tarball to stdout
            "|",
            "bsdtar",
            "-cf",
            "/tmp/output",
            "--format=gnutar",
            "@/dev/stdin", // rootfs tarball from stdin
        ];
        return ["/usr/bin/env", "bash", "-c", cmd.join(" ")];
    }

    // returns the command to create ext2 from a rootfs
    private static createExt2Command(extraBytes: number): string[] {
        const blockSize = 4096;
        const extraBlocks = Math.ceil(extraBytes / blockSize);
        const extraSize = `+${extraBlocks}`;

        return [
            "xgenext2fs",
            "--tarball",
            "/tmp/input0",
            "--block-size",
            blockSize.toString(),
            "--faketime",
            "-r",
            extraSize,
            "/tmp/output",
        ];
    }

    private static createSquashfsCommand(): string[] {
        const cmd = [
            "cat",
            "/tmp/input0",
            "|",
            "mksquashfs",
            "-",
            "/tmp/output",
            "-tar",
            "-mkfs-time",
            "0",
            "-all-time",
            "0",
            "-all-root",
            "-noappend",
            "-no-exports",
            "-comp",
            "lzo",
            "-quiet",
            "-no-progress",
        ];
        return ["/usr/bin/env", "bash", "-c", cmd.join(" ")];
    }

    private static createDriveCommand(
        type: DriveType,
        extraBytes: number,
    ): string[] {
        switch (type) {
            case "ext2":
                return BuildApplication.createExt2Command(extraBytes);
            case "sqfs":
                return BuildApplication.createSquashfsCommand();
        }
    }

    private async createMachineSnapshotCommand(
        info: ImageInfo,
    ): Promise<string[]> {
        const ramSize = info.ramSize;
        const entrypoint = ["rollup-init", "crun", "run", "app"].join(" ");
        const cwd = "--append-init=WORKDIR=/run/cruntime";

        const flashDriveArgs: string[] = [
            `--flash-drive=label:root,filename:/tmp/input0`,
            `--flash-drive=label:dapp,filename:/tmp/input1,mount:/run/cruntime`,
        ];

        const result = [
            "cartesi-machine",
            "--assert-rolling-template",
            `--ram-length=${ramSize}`,
            ...flashDriveArgs,
            "--final-hash",
            "--store=/tmp/output",
            "--append-bootargs=no4lvl",
            "--append-bootargs=rootfstype=squashfs",
            "--append-init=/bin/sh /etc/cartesi-init.d/cruntime-init",
            cwd,
            `--append-entrypoint=${entrypoint}`,
        ];

        return result;
    }

    //TODO: embedd cruntime.sqfs into cartesi/sdk image
    // move the packages/cruntime code to packages/sdk
    private async createCruntimeDrive(
        image: string,
        sdkImage: string,
    ): Promise<void> {
        const cruntimeTarPath = this.getContextPath("cruntime.tar");
        const cruntimeGnutarPath = this.getContextPath("cruntime.gnutar");
        const cruntimeDrivePath = this.getContextPath("cruntime.drive");

        try {
            await this.createTarball(image, cruntimeTarPath);

            await this.sdkRun(
                sdkImage,
                BuildApplication.createRootfsTarCommand(),
                [cruntimeTarPath],
                cruntimeGnutarPath,
            );

            await this.sdkRun(
                sdkImage,
                BuildApplication.createDriveCommand("sqfs", 0),
                [cruntimeGnutarPath],
                cruntimeDrivePath,
            );
        } finally {
            await fs.remove(cruntimeGnutarPath);
            await fs.remove(cruntimeTarPath);
        }
    }

    private async createAppOCIBundle(
        image: string,
        imageInfo: ImageInfo,
        sdkImage: string,
    ): Promise<void> {
        const { flags } = await this.parse(BuildApplication);
        const driveType = flags["drive-type"] as DriveType;

        const appTarPath = this.getContextPath("app.tar");
        const appGnutarPath = this.getContextPath("app.gnutar");
        const appOCIBundlePath = this.getContextPath("app.ocibundle.tar");
        const appDrivePath = this.getContextPath("app.drive");

        try {
            // create OCI Image tarball
            await this.createTarball(image, appTarPath);

            // create rootfs tar
            await this.sdkRun(
                sdkImage,
                BuildApplication.createRootfsTarCommand(),
                [appTarPath],
                appGnutarPath,
            );

            // prepare OCI Bundle
            const extract = tar.extract();
            const pack = tar.pack();
            const appGnuTarStream = fs.createReadStream(appGnutarPath);
            const appOCIBundleStream = fs.createWriteStream(appOCIBundlePath);
            const ociConfigJSON = JSON.stringify(createConfig(imageInfo));

            // add config.json
            pack.entry({ name: "config.json" }, ociConfigJSON, function (err) {
                if (err) throw err;
                console.log("ERROR config.json");
                pack.finalize();
            });

            // add rootfs/ prefix
            extract.on("entry", function (header, stream, callback) {
                header.name = path.join("rootfs", header.name);
                stream.pipe(pack.entry(header, callback));
            });

            // save tarball for OCI Bundle
            appGnuTarStream.pipe(extract);
            pack.pipe(appOCIBundleStream);

            // appOCIBundleStream.on("close", function () {
            //     console.log(path + " has been written");
            // });

            // extract.on("finish", function () {
            //     pack.finalize();
            // });

            // create drive
            await this.sdkRun(
                sdkImage,
                BuildApplication.createDriveCommand(
                    driveType,
                    bytes.parse(imageInfo.dataSize),
                ),
                [appOCIBundlePath],
                appDrivePath,
            );
        } finally {
            //await fs.remove(appTarPath);
            //await fs.remove(appGnutarPath);
            //await fs.remove(appOCIBundlePath);
        }
    }

    public async run(): Promise<void> {
        const { flags } = await this.parse(BuildApplication);

        const snapshotPath = this.getContextPath("image");
        const cruntimeDrivePath = this.getContextPath("cruntime.drive");
        const appDrivePath = this.getContextPath("app.drive");

        // clean up temp files we create along the process
        tmp.setGracefulCleanup();

        // use pre-existing image or build dapp image
        const appImage = flags["from-image"] || (await this.buildImage(flags));

        // prepare context directory
        await fs.emptyDir(this.getContextPath()); // XXX: make it less error prone

        // get and validate image info
        const imageInfo = await this.getImageInfo(appImage);

        // resolve sdk version
        const sdkImage = `cartesi/sdk:${imageInfo.sdkVersion}`;

        try {
            // create cruntime drive
            await this.createCruntimeDrive(CARTESI_CRUNTIME_IMAGE, sdkImage);

            // create app drive
            await this.createAppOCIBundle(appImage, imageInfo, sdkImage);

            // create machine snapshot
            if (!flags["skip-snapshot"]) {
                await this.sdkRun(
                    sdkImage,
                    await this.createMachineSnapshotCommand(imageInfo),
                    [cruntimeDrivePath, appDrivePath],
                    snapshotPath,
                );
                await fs.chmod(snapshotPath, 0o755);
            }
        } catch (e: unknown) {
            this.error(e as Error);
        }
    }
}
