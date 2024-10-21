import { parse, Range, SemVer } from "semver";
import {
    DockerFallbackOptions,
    execaDockerFallback,
    ExecaOptionsDockerFallback,
} from "./util.js";

export const requiredVersion = new Range("^0.18.1");

export const boot = async (
    args: readonly string[],
    options: ExecaOptionsDockerFallback,
) => {
    return execaDockerFallback("cartesi-machine", args, options);
};

export const version = async (
    options?: DockerFallbackOptions,
): Promise<SemVer | null> => {
    const { image } = options || {};
    try {
        const { stdout } = await execaDockerFallback(
            "cartesi-machine",
            ["--version-json"],
            { image },
        );
        if (typeof stdout === "string") {
            const output = JSON.parse(stdout);
            return parse(output.version);
        }
        return null;
    } catch (e: unknown) {
        return null;
    }
};
