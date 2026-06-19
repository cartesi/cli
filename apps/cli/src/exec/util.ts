import { ExecaError, execa, type Options } from "execa";
import os from "node:os";

export type DockerFallbackOptions =
    | { image: string; forceDocker: true; tty?: boolean }
    | { image?: string; forceDocker?: false; tty?: boolean };

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
                const userInfo = os.userInfo();
                const optionalTTY = options.tty ? ["--tty"] : [];
                const dockerOpts = [
                    "--volume",
                    `${options.cwd}:/work`,
                    "--workdir",
                    "/work",
                    "--interactive",
                    ...optionalTTY,
                    "--rm",
                    "--user",
                    `${userInfo.uid}:${userInfo.gid}`,
                ];
                return await execa(
                    "docker",
                    ["run", ...dockerOpts, options.image, command, ...args],
                    options,
                );
            }
        }
        throw error;
    }
};
