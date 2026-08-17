import { execa } from "execa";
import fs from "fs-extra";
import path from "node:path";
import tmp from "tmp";
import type { DockerDriveConfig } from "../config.js";
import { genext2fs, mksquashfs } from "../exec/index.js";
import type { Reporter } from "../exec/util.js";
import type { BuildxMetadata } from "../types/docker.js";

type ImageBuildOptions = Pick<
    DockerDriveConfig,
    "buildArgs" | "context" | "dockerfile" | "tags" | "target"
> & { destination: string; dockerfileContent?: string; reporter?: Reporter };

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
    const {
        buildArgs,
        context,
        destination,
        dockerfile,
        dockerfileContent,
        reporter,
        tags,
        target,
    } = options;

    // if dockerfileContext is specified, use it as the dockerfile passed through stdin
    const args = [
        "buildx",
        "build",
        "--platform",
        "linux/riscv64",
        "--file",
        dockerfileContent ? "-" : dockerfile,
        "--output",
        "type=docker",
        "--output",
        `type=tar,dest=${destination}`,
        "--progress",
        reporter ? "plain" : "quiet",
    ];

    // set tags for the image built
    args.push(...tags.flatMap((tag) => ["--tag", tag]));

    // set build args
    args.push(...buildArgs.flatMap((arg) => ["--build-arg", arg]));

    // use --metadata-file to capture the image ID from json format file, so stdout can be safely
    // ignored regardless of what --progress mode outputs there
    const tmpFile = tmp.tmpNameSync();
    args.push("--metadata-file", tmpFile);

    if (target) {
        args.push("--target", target);
    }

    args.push(context);

    if (reporter)
        reporter(`Building docker image with args: ${args.join(" ")}`);

    const proc = execa("docker", args, { input: dockerfileContent });
    if (reporter) {
        proc.stderr?.on("data", (chunk: Buffer) => {
            for (const line of chunk.toString().split("\n")) {
                if (line.trim()) reporter(line.trimEnd());
            }
        });
    }
    await proc;
    const metadata = JSON.parse(
        fs.readFileSync(tmpFile, "utf-8"),
    ) as BuildxMetadata;

    return (
        metadata["containerimage.config.digest"] ??
        metadata["containerimage.digest"] ??
        ""
    );
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
    if (imageInfo.Architecture !== "riscv64") {
        throw new Error(
            `Invalid image Architecture: ${imageInfo.Architecture}. Expected riscv64`,
        );
    }

    const info: ImageInfo = {
        cmd: imageInfo.Config.Cmd ?? [],
        entrypoint: imageInfo.Config.Entrypoint ?? [],
        env: imageInfo.Config.Env || [],
        workdir: imageInfo.Config.WorkingDir,
    };

    return info;
};

export const build = async (
    name: string,
    drive: DockerDriveConfig,
    sdkImage: string,
    destination: string,
    debug: boolean,
    reporter?: Reporter,
): Promise<ImageInfo | undefined> => {
    const { format } = drive;

    const tar = `${name}.tar`;
    const filename = `${name}.${format}`;

    // use pre-existing image or build docker image
    let image: string;

    if (drive.image) {
        // build a docker image with `FROM <image>`
        image = await buildImage({
            ...drive,
            destination: path.join(destination, tar),
            dockerfileContent: `FROM ${drive.image}`,
            reporter,
        });
    } else {
        image = await buildImage({
            ...drive,
            destination: path.join(destination, tar),
            reporter,
        });
    }
    const imageInfo = await getImageInfo(image);

    try {
        switch (format) {
            case "ext2": {
                await genext2fs.fromTar({
                    extraSize: drive.extraSize,
                    input: tar,
                    output: filename,
                    cwd: destination,
                    reporter,
                });
                break;
            }
            case "sqfs": {
                await mksquashfs.fromTar({
                    input: path.join(destination, tar),
                    output: filename,
                    cwd: destination,
                    image: sdkImage,
                    reporter,
                });
                break;
            }
        }
    } finally {
        // delete intermediate files
        if (!debug) {
            await fs.remove(path.join(destination, tar));
        }
    }

    return imageInfo;
};
