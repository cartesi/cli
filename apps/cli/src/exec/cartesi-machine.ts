import { parse, Range, type SemVer } from "semver";
import {
    execaDockerFallback,
    type ExecaOptionsDockerFallback,
} from "./util.js";

export const requiredVersion = new Range("^0.21.0");

export const boot = (
    args: readonly string[],
    options: ExecaOptionsDockerFallback,
) => execaDockerFallback("cartesi-machine", args, options);

export const version = async (
    options?: ExecaOptionsDockerFallback,
): Promise<SemVer | null> => {
    try {
        const { stdout } = await execaDockerFallback(
            "cartesi-machine",
            ["--version-json"],
            // cwd is interpolated into the docker volume mount, so it must be defined
            { ...options, cwd: options?.cwd ?? process.cwd() },
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
