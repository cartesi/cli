import { execa } from "execa";
import fs from "fs-extra";
import path from "path";
import tmp from "tmp";
import { DockerDriveConfig } from "../config.js";
import { execaDockerFallback, spawnSyncDockerFallback } from "../exec.js";
import { tarToExt } from "./index.js";

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

export const build = async (
    name: string,
    drive: DockerDriveConfig,
    sdkImage: string,
    destination: string,
): Promise<ImageInfo | undefined> => {
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
        await spawnSyncDockerFallback("crane", ["export", "-", "-"], {
            stdio: [
                fs.openSync(path.join(destination, ocitar), "r"),
                fs.openSync(path.join(destination, tar), "w"),
                "inherit",
            ],
            image: sdkImage,
        });

        switch (format) {
            case "ext2": {
                // create ext2
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
        // await fs.remove(path.join(destination, ocitar));
        // await fs.remove(path.join(destination, tar));
    }

    return imageInfo;
};
