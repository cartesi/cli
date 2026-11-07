import { Command } from "@commander-js/extra-typings";
import { execa } from "execa";
import { getProjectName } from "../base.js";
import { isSentryService } from "../compose/sentry.js";

/** The node's compose service, shown by default and first. */
export const NODE_SERVICE = "rollups_node";

/**
 * The services of a running environment, as compose lists them; an exited
 * container is still listed, so its last logs can be read.
 */
export const listServices = async (projectName: string): Promise<string[]> => {
    const { stdout } = await execa("docker", [
        "compose",
        "--project-name",
        projectName,
        "ps",
        "--services",
        "--all",
    ]);
    return stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
};

/**
 * The services to show: the ones named, checked against the environment, or
 * the node followed by every sentry.
 * @param services the environment's services, from `listServices`
 * @param requested the services named on the command line
 * @throws when the node isn't there, or a named service isn't
 */
export const selectLogServices = (
    services: string[],
    requested: string[],
): string[] => {
    if (requested.length === 0) {
        if (!services.includes(NODE_SERVICE)) {
            throw new Error(`service ${NODE_SERVICE} not found`);
        }
        return [NODE_SERVICE, ...services.filter(isSentryService)];
    }
    // compose shows nothing for an unknown service, without an error
    const unknown = requested.filter((service) => !services.includes(service));
    if (unknown.length > 0) {
        throw new Error(
            `service ${unknown.join(", ")} not found; the environment has ${services.join(", ")}`,
        );
    }
    return requested;
};

/**
 * The `docker compose logs` arguments. One service is shown as it is, like
 * `docker container logs`; more than one get compose's per-service prefix,
 * which tells the node's lines from the sentries'.
 */
export const buildLogsArgs = (options: {
    follow?: boolean;
    projectName: string;
    services: string[];
    since?: string;
    tail?: string;
    until?: string;
}): string[] => {
    const { follow, projectName, services, since, tail, until } = options;
    const args = ["compose", "--project-name", projectName, "logs"];
    if (follow) args.push("--follow");
    if (since) args.push("--since", since);
    if (tail) args.push("--tail", tail);
    if (until) args.push("--until", until);
    if (services.length === 1) args.push("--no-log-prefix");
    return [...args, ...services];
};

export const createLogsCommand = () => {
    return new Command("logs")
        .description(
            "Show logs of a local environment: the node and its sentries, or the services named.",
        )
        .argument(
            "[service...]",
            "services to show, as cartesi run names them (default: the node and the sentries)",
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
            const { follow, since, tail, until } = options;
            const projectName = getProjectName(options);
            const services = selectLogServices(
                await listServices(projectName),
                requested,
            );

            await execa(
                "docker",
                buildLogsArgs({
                    follow,
                    projectName,
                    services,
                    since,
                    tail,
                    until,
                }),
                { stdio: "inherit" },
            );
        });
};
