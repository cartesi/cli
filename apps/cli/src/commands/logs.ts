import { Command } from "@commander-js/extra-typings";
import { execa } from "execa";
import { getProjectName, getServiceInfo } from "../base.js";

export const createLogsCommand = () => {
    return new Command("logs")
        .description("Show logs of a local environment.")
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
        .action(async (options) => {
            const { follow, since, tail, until } = options;
            const projectName = getProjectName(options);
            const logOptions: string[] = [];
            if (follow) logOptions.push("--follow");
            if (since) logOptions.push("--since", since);
            if (tail) logOptions.push("--tail", tail);
            if (until) logOptions.push("--until", until);

            const serviceInfo = await getServiceInfo({
                projectName,
                service: "rollups-node",
            });
            if (!serviceInfo) {
                throw new Error(`service rollups-node not found`);
            }

            await execa(
                "docker",
                ["container", "logs", ...logOptions, serviceInfo.ID],
                { stdio: "inherit" },
            );
        });
};
