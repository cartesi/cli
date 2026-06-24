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
            const hash = `0x${stdout.toString().trim()}`;

            if (isHash(hash)) {
                return hash;
            }
        }

        return undefined;
    } catch {
        return undefined;
    }
};
