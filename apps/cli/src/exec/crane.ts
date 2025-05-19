import type { Stream } from "node:stream";
import { Range, type SemVer, parse } from "semver";
import { type DockerFallbackOptions, spawnSyncDockerFallback } from "./util.js";

export const requiredVersion = new Range("^0.19.1");

export const exportImage = async (
    options: {
        stdin: Stream | number;
        stdout: Stream | number;
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
