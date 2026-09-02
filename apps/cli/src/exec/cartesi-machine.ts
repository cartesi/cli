import { parse, Range, satisfies, type SemVer } from "semver";
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

export class UnsupportedVersionError extends Error {
    constructor(found: SemVer) {
        super(
            `cartesi-machine ${found.format()} found, but ${requiredVersion.raw} is required`,
        );
        this.name = "UnsupportedVersionError";
    }
}

/**
 * Throws if the cartesi-machine that would be used does not satisfy `requiredVersion`. A version
 * that cannot be determined is not an error, as `version` also returns null when the binary is
 * missing or docker is unavailable, and booting reports those on its own.
 */
export const assertVersion = async (
    options?: ExecaOptionsDockerFallback,
): Promise<void> => {
    const found = await version(options);
    if (found !== null && !satisfies(found.format(), requiredVersion)) {
        throw new UnsupportedVersionError(found);
    }
};
