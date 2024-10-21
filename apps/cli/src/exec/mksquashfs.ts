import { parse, Range, SemVer } from "semver";
import { DockerFallbackOptions, execaDockerFallback } from "./util.js";

const COMPRESSION = "lzo"; // make customizable? default is gzip

export const requiredVersion: Range = new Range("^4.5.1");

const baseArgs = () => [
    "--all-time",
    "0",
    "-all-root", // XXX: should we use this?
    "-noappend",
    "-comp",
    COMPRESSION,
    "-no-progress",
];

export const fromDirectory = (
    options: {
        cwd?: string;
        input: string;
        output: string;
    } & DockerFallbackOptions,
) => {
    const { cwd, image, input, output } = options;
    return execaDockerFallback("mksquashfs", [input, output, ...baseArgs()], {
        cwd,
        image,
    });
};

export const fromTar = (
    options: {
        cwd?: string;
        input: string;
        output: string;
    } & DockerFallbackOptions,
) => {
    const { cwd, image, input, output } = options;
    return execaDockerFallback(
        "mksquashfs",
        ["-", output, "-tar", ...baseArgs()],
        {
            cwd,
            image,
            inputFile: input, // use stdin in case of tar file
        },
    );
};

export const version = async (
    options?: DockerFallbackOptions,
): Promise<SemVer | null> => {
    try {
        const { stdout } = await execaDockerFallback(
            "mksquashfs",
            ["-version"],
            options || {},
        );
        if (typeof stdout === "string") {
            const regex =
                /(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?/gm;
            const m = stdout.match(regex);
            if (m && m[0]) {
                return parse(m[0]);
            }
        }
    } catch (e: unknown) {
        console.error(e);
        return null;
    }
    return null;
};
