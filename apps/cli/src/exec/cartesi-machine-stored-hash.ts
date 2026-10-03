import { isHash, type Hash } from "viem";
import { DEFAULT_SDK_IMAGE, DEFAULT_SDK_VERSION } from "../config.js";
import { execaDockerFallback, type DockerFallbackOptions } from "./util.js";

type ComputeHashOptions = { cwd?: string } & DockerFallbackOptions;

/**
 *
 * @param machineDir
 * @param options
 * @returns
 */
export const computeHash = async (
    machineDir: string,
    options?: ComputeHashOptions,
): Promise<Hash | undefined> => {
    const defaultImage = `${DEFAULT_SDK_IMAGE}:${DEFAULT_SDK_VERSION}`;
    const execaOptions = Object.assign(
        {},
        { image: defaultImage, cwd: process.cwd() },
        options,
    );

    try {
        const { stdout } = await execaDockerFallback(
            "cartesi-machine-stored-hash",
            [machineDir],
            execaOptions,
        );

        if (undefined !== stdout) {
            // cartesi-machine-stored-hash prints a bare digest up to emulator
            // 0.20 and a 0x-prefixed one from 0.21 on.
            const digest = stdout.toString().trim();
            const hash = digest.startsWith("0x") ? digest : `0x${digest}`;

            if (isHash(hash)) {
                return hash;
            }
        }

        return undefined;
    } catch {
        return undefined;
    }
};
