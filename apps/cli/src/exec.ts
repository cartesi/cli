import { execa, ExecaError, Options } from "execa";

/**
 * Calls execa and falls back to docker run if command (on the host) fails
 * @param command command to be executed
 * @param args arguments to be passed to the command
 * @param options execution options
 * @returns return of execa
 */
export type OptionsDockerFallback = Options & { image?: string };
export const execaDockerFallback = async (
    command: string,
    args: readonly string[],
    options: OptionsDockerFallback,
) => {
    try {
        return await execa(command, args, options);
    } catch (error) {
        if (error instanceof ExecaError) {
            if (error.code === "ENOENT" && options.image) {
                return await execa(
                    "docker",
                    [
                        "run",
                        "--volume",
                        `${options.cwd}:/work`,
                        "--workdir",
                        "/work",
                        options.image,
                        command,
                        ...args,
                    ],
                    options,
                );
            }
        }
        throw error;
    }
};
