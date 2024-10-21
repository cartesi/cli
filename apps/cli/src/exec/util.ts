import { spawnSync, SpawnSyncOptions } from "child_process";
import { execa, ExecaError, Options } from "execa";
import os from "os";

export type DockerFallbackOptions =
    | { image: string; forceDocker: true }
    | { image?: string; forceDocker?: false };

/**
 * Calls execa and falls back to docker run if command (on the host) fails
 * @param command command to be executed
 * @param args arguments to be passed to the command
 * @param options execution options
 * @returns return of execa
 */
export type ExecaOptionsDockerFallback = Options & DockerFallbackOptions;
export const execaDockerFallback = async (
    command: string,
    args: readonly string[],
    options: ExecaOptionsDockerFallback,
) => {
    try {
        if (options.forceDocker) {
            const error = new ExecaError();
            error.code = "ENOENT";
            throw error;
        }
        return await execa(command, args, options);
    } catch (error) {
        if (error instanceof ExecaError) {
            if (error.code === "ENOENT" && options.image) {
                if (!options.forceDocker) {
                    console.warn(
                        `error executing '${command}', falling back to docker execution using image '${options.image}'`,
                    );
                }
                const userInfo = os.userInfo();
                const dockerOpts = [
                    "--volume",
                    `${options.cwd}:/work`,
                    "--workdir",
                    "/work",
                    "--interactive",
                    "--user",
                    `${userInfo.uid}:${userInfo.gid}`,
                ];
                return await execa(
                    "docker",
                    ["run", ...dockerOpts, options.image, command, ...args],
                    options,
                );
            } else {
                console.error(`error executing '${command}'`, error);
            }
        }
        throw error;
    }
};

/**
 * Calls spawnSync and falls back to docker run if command (on the host) fails
 * @param command command to be executed
 * @param args arguments to be passed to the command
 * @param options execution options
 * @returns return of execa
 */
export type SpawnOptionsDockerFallback = SpawnSyncOptions &
    DockerFallbackOptions;
export const spawnSyncDockerFallback = (
    command: string,
    args: readonly string[],
    options: SpawnOptionsDockerFallback,
) => {
    const result = options.forceDocker
        ? { error: { code: "ENOENT" }, stdout: "" }
        : spawnSync(command, args, options);
    if (result.error) {
        const code = (result.error as any).code;
        if (code === "ENOENT" && options.image) {
            if (!options.forceDocker) {
                console.warn(
                    `error executing '${command}', falling back to docker execution using image '${options.image}'`,
                );
            }
            const userInfo = os.userInfo();
            const dockerOpts = [
                "--volume",
                `${options.cwd}:/work`,
                "--workdir",
                "/work",
                "--interactive",
                "--user",
                `${userInfo.uid}:${userInfo.gid}`,
            ];
            const dockerArgs = [
                "run",
                ...dockerOpts,
                options.image,
                command,
                ...args,
            ];
            const dockerResult = spawnSync("docker", dockerArgs, options);
            if (dockerResult.error) {
                console.error(
                    `error executing '${command}'`,
                    dockerResult.error,
                );
                throw dockerResult.error;
            }
            return dockerResult;
        } else {
            console.error(`error executing '${command}'`, result.error);
            throw result.error;
        }
    }
    return result;
};
