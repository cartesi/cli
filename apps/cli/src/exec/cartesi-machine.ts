import { parse, Range, type SemVer } from "semver";
import {
    execaDockerFallback,
    type DockerFallbackOptions,
    type ExecaOptionsDockerFallback,
} from "./util.js";

export const requiredVersion = new Range("^0.19.0");

export const boot = (
    args: readonly string[],
    options: ExecaOptionsDockerFallback,
) => execaDockerFallback("cartesi-machine", args, options);

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
    } catch {
        return null;
    }
};
