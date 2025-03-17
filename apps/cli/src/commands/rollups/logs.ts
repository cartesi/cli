import { Command } from "@commander-js/extra-typings";
import { execa } from "execa";
import { RollupsCommandOpts } from "../rollups.js";

export const createLogsCommand = () => {
    return new Command<[], {}, RollupsCommandOpts>("logs")
        .description("Show logs of a local rollups node environment.")
        .option("-f, --follow", "Follow log output")
        .option("--no-color", "Produce monochrome output")
        .option("--no-log-prefix", "Don't print prefix in logs")
        .option(
            "--since <string>",
            "Show logs since timestamp (e.g. 2013-01-02T13:23:37Z) or relative (e.g. 42m for 42 minutes)",
        )
        .option(
            "-n, --tail <string>",
            "Number of lines to show from the end of the logs",
            "all",
        )
        .option("-t, --timestamps", "Show timestamps")
        .option(
            "--until <string>",
            "Show logs before a timestamp (e.g. 2013-01-02T13:23:37Z) or relative (e.g. 42m for 42 minutes)",
        )
        .configureHelp({ showGlobalOptions: true })
        .action(
            async (
                { follow, color, logPrefix, since, tail, timestamps, until },
                command,
            ) => {
                const { projectName } = command.optsWithGlobals();
                const logOptions: string[] = [];
                if (follow) logOptions.push("--follow");
                if (color === false) logOptions.push("--no-color");
                if (logPrefix === false) logOptions.push("--no-log-prefix");
                if (since) logOptions.push("--since", since);
                if (tail) logOptions.push("--tail", tail);
                if (timestamps) logOptions.push("--timestamps");
                await execa(
                    "docker",
                    [
                        "compose",
                        "-p",
                        projectName,
                        "logs",
                        ...logOptions,
                        "rollups-node",
                    ],
                    { stdio: "inherit" },
                );
            },
        );
};
