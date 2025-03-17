import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import { execa } from "execa";
import ora from "ora";
import { RollupsCommandOpts } from "../rollups";

export const createStopCommand = () => {
    return new Command<[], {}, RollupsCommandOpts>("stop")
        .description("Stop a local rollups node environment.")
        .configureHelp({ showGlobalOptions: true })
        .action(async (_options, command) => {
            const { environmentName } = command.optsWithGlobals();
            const progress = ora(
                `Stopping ${chalk.cyan(environmentName)} environment...`,
            ).start();
            try {
                await execa("docker", [
                    "compose",
                    "-p",
                    environmentName,
                    "down",
                    "--volumes",
                ]);
                progress.succeed(
                    `${chalk.cyan(environmentName)} environment stopped.`,
                );
            } catch (e: unknown) {
                progress.fail((e as Error).message);
            }
        });
};
