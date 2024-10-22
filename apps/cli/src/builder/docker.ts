import { execa } from "execa";
import fs from "fs-extra";
import path from "path";
import tmp from "tmp";
import { DockerDriveConfig } from "../config.js";
import { crane, genext2fs, mksquashfs } from "../exec/index.js";

type ImageBuildOptions = Pick<
    DockerDriveConfig,
    "context" | "dockerfile" | "tags" | "target"
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
    const { context, dockerfile, tags, target } = options;
    const buildResult = tmp.tmpNameSync();
    const args = [
        "buildx",
        "build",
        "--platform",
        "linux/riscv64",
        "--file",
        dockerfile,
        "--load",
        "--iidfile",
        buildResult,
        context,
    ];

    // set tags for the image built
    args.push(...tags.map((tag) => ["--tag", tag]).flat());

    if (target) {
        args.push("--target", target);
    }

    await execa("docker", args, { stdio: "inherit" });
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
    let image: string;
    if (drive.image) {
        image = drive.image;
        await execa("docker", ["image", "pull", image]);
    } else {
        image = await buildImage(drive);
    }

    // get image info
    const imageInfo = await getImageInfo(image);

    try {
        // create OCI Docker tarball from Docker image
        await execa("docker", ["image", "save", image, "-o", ocitar], {
            cwd: destination,
        });

        // create rootfs tar from OCI tar
        await crane.exportImage({
            stdin: fs.openSync(path.join(destination, ocitar), "r"),
            stdout: fs.openSync(path.join(destination, tar), "w"),
            image: sdkImage,
        });

        switch (format) {
            case "ext2": {
                await genext2fs.fromTar({
                    extraSize: drive.extraSize,
                    input: tar,
                    output: filename,
                    cwd: destination,
                    image: sdkImage,
                });
                break;
            }
            case "sqfs": {
                await mksquashfs.fromTar({
                    input: path.join(destination, tar),
                    output: filename,
                    cwd: destination,
                    image: sdkImage,
                });
                break;
            }
        }
    } finally {
        // delete intermediate files
        await fs.remove(path.join(destination, ocitar));
        await fs.remove(path.join(destination, tar));
    }

    return imageInfo;
};
