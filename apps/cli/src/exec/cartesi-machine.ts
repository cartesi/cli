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
 * Throws unless `found` satisfies `requiredVersion`. A version that could not be determined is
 * deliberately not an error: `version` also returns null when the binary is missing or docker is
 * unavailable, and booting reports those on its own.
 */
export const assertSupported = (found: SemVer | null): void => {
    if (found !== null && !satisfies(found.format(), requiredVersion)) {
        throw new UnsupportedVersionError(found);
    }
};

/**
 * Throws if the cartesi-machine that would be used does not satisfy `requiredVersion`.
 */
export const assertVersion = async (
    options?: ExecaOptionsDockerFallback,
): Promise<void> => assertSupported(await version(options));
