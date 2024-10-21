import { parse, Range, SemVer } from "semver";
import { Stream } from "stream";
import { DockerFallbackOptions, spawnSyncDockerFallback } from "./util.js";

export const requiredVersion = new Range("^0.19.1");

export const exportImage = async (
    options: {
        stdin: Stream;
        stdout: Stream;
    } & DockerFallbackOptions,
) => {
    const { image, stdin, stdout } = options;
    return spawnSyncDockerFallback("crane", ["export", "-", "-"], {
        image,
        stdio: [stdin, stdout, "inherit"],
    });
};

export const version = async (
    options?: DockerFallbackOptions,
): Promise<SemVer | null> => {
    const result = spawnSyncDockerFallback("crane", ["version"], options || {});
    if (result.error) {
        return null;
    }
    return parse(result.stdout.toString());
};
