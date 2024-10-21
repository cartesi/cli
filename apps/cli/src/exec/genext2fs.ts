import { parse, Range, SemVer } from "semver";
import { DockerFallbackOptions, execaDockerFallback } from "./util.js";

const BLOCK_SIZE = 4096; // fixed at 4k

export const requiredVersion: Range = new Range("^1.5.6");

const baseArgs = (options: { extraBlocks: number }) => [
    "--block-size",
    BLOCK_SIZE.toString(),
    "--faketime",
    "--readjustment",
    `+${options.extraBlocks}`,
];

export const fromDirectory = async (
    options: {
        cwd?: string;
        extraSize: number;
        input: string;
        output: string;
    } & DockerFallbackOptions,
) => {
    const { cwd, extraSize, image, input, output } = options;
    const extraBlocks = Math.ceil(extraSize / BLOCK_SIZE);
    return execaDockerFallback(
        "xgenext2fs",
        [...baseArgs({ extraBlocks }), "--root", input, output],
        { cwd, image },
    );
};

export const fromTar = async (
    options: {
        cwd?: string;
        extraSize: number;
        input: string;
        output: string;
    } & DockerFallbackOptions,
) => {
    const { cwd, extraSize, image, input, output } = options;
    const extraBlocks = Math.ceil(extraSize / BLOCK_SIZE);
    return execaDockerFallback(
        "xgenext2fs",
        [...baseArgs({ extraBlocks }), "--tarball", input, output],
        { cwd, image },
    );
};

export const version = async (
    options?: DockerFallbackOptions,
): Promise<SemVer | null> => {
    const { stdout } = await execaDockerFallback(
        "xgenext2fs",
        ["--version"],
        options || {},
    );
    if (typeof stdout === "string") {
        const regex =
            /(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?/;
        const m = stdout.match(regex);
        if (m && m[0]) {
            return parse(m[0]);
        }
    }
    return null;
};
