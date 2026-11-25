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
            "name of project (used by cartesi-rollups-node)",
        )
        .option("-f, --follow", "Follow log output")
        .option(
            "-n, --tail <string>",
            "Number of lines to show from the end of the logs",
            "all",
        )
        .configureHelp({ showGlobalOptions: true })
        .action(async (requested, options) => {
            const { follow, projectName, tail } = options;

            await logs({
                follow,
                projectName,
                services: requested,
                stream: true,
                tail,
            });
        });
};
