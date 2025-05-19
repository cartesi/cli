import { Command } from "@commander-js/extra-typings";
import { execa } from "execa";
import { DEFAULT_COMPOSE_ENVIRONMENT_NAME } from "../config.js";

export const createLogsCommand = () => {
    return new Command("logs")
        .description("Show logs of a local environment.")
        .option(
            "--environment-name <string>",
            "name of environment",
            DEFAULT_COMPOSE_ENVIRONMENT_NAME,
        )
        .option("-f, --follow", "Follow log output")
        .option("--no-color", "Produce monochrome output")
        .option(
            "--since <string>",
            "Show logs since timestamp (e.g. 2013-01-02T13:23:37Z) or relative (e.g. 42m for 42 minutes)",
        )
        .option(
            "-n, --tail <string>",
            "Number of lines to show from the end of the logs",
            "all",
        )
        .option(
            "--until <string>",
            "Show logs before a timestamp (e.g. 2013-01-02T13:23:37Z) or relative (e.g. 42m for 42 minutes)",
        )
        .configureHelp({ showGlobalOptions: true })
        .action(
            async (
                { environmentName, follow, color, since, tail, until },
                command,
            ) => {
                const logOptions: string[] = ["--no-log-prefix"];
                if (follow) logOptions.push("--follow");
                if (color === false) logOptions.push("--no-color");
                if (since) logOptions.push("--since", since);
                if (tail) logOptions.push("--tail", tail);
                await execa(
                    "docker",
                    [
                        "compose",
                        "--project-name",
                        environmentName,
                        "logs",
                        ...logOptions,
                        "rollups-node",
                    ],
                    { stdio: "inherit" },
                );
            },
        );
};
