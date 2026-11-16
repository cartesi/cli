import { Command } from "@commander-js/extra-typings";
import { logs } from "../api/logs.js";

export const createLogsCommand = () => {
    return new Command("logs")
        .description(
            "Show logs of a local environment: the node and its PRT nodes, or the services named.",
        )
        .argument(
            "[service...]",
            "services to show, as cartesi run names them (default: the node and the PRT nodes)",
        )
        .option(
            "--project-name <string>",
            "name of project (used by docker compose and cartesi-rollups-node)",
        )
        .option("-f, --follow", "Follow log output")
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
        .action(async (requested, options) => {
            const { follow, projectName, since, tail, until } = options;

            await logs({
                follow,
                projectName,
                services: requested,
                since,
                stream: true,
                tail,
                until,
            });
        });
};
