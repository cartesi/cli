import { execa } from "execa";
import { getProjectName } from "../base.js";
import { isPrtNodeService } from "../compose/prt-node.js";

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
 * the node followed by every PRT node.
 * @param services the environment's services, from `listServices`
 * @param requested the services named by the caller
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
        return [NODE_SERVICE, ...services.filter(isPrtNodeService)];
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
 * which tells the node's lines from the PRT nodes'.
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

export type LogsOptions = {
    /**
     * Name of the project (used by docker compose and cartesi-rollups-node).
     * @default basename of the current working directory
     */
    projectName?: string;

    /**
     * Services to show, as `run` names them.
     * @default the node followed by every PRT node
     */
    services?: string[];

    /** Follow log output. */
    follow?: boolean;

    /**
     * Show logs since timestamp (e.g. 2013-01-02T13:23:37Z) or relative
     * (e.g. 42m for 42 minutes).
     */
    since?: string;

    /**
     * Number of lines to show from the end of the logs.
     * @default "all"
     */
    tail?: string;

    /**
     * Show logs before a timestamp (e.g. 2013-01-02T13:23:37Z) or relative
     * (e.g. 42m for 42 minutes).
     */
    until?: string;

    /**
     * Write the logs directly to the terminal instead of returning them.
     * @default false
     */
    stream?: boolean;

    /**
     * Called for every log line, as they are produced. Useful together with
     * `follow`, where collecting the whole output is not an option. The
     * returned logs are empty when it consumes them.
     */
    onLine?: (line: string) => void;
};

/**
 * Read the logs of a local environment: the rollups node and its PRT nodes, or
 * the services given.
 *
 * By default the logs are collected and returned. When `stream` is enabled the
 * logs are written directly to the terminal and nothing is returned. Individual
 * lines can also be consumed as they are produced by using `onLine`.
 *
 * @param options logs options
 * @returns the collected logs, or `undefined` when `stream` is enabled
 */
export const logs = async (
    options: LogsOptions = {},
): Promise<string | undefined> => {
    const {
        follow,
        onLine,
        since,
        stream = false,
        tail = "all",
        until,
    } = options;
    const projectName = getProjectName(options);

    const services = selectLogServices(
        await listServices(projectName),
        options.services ?? [],
    );

    const args = buildLogsArgs({
        follow,
        projectName,
        services,
        since,
        tail,
        until,
    });

    if (stream) {
        await execa("docker", args, { stdio: "inherit" });
        return undefined;
    }

    // interleave stdout and stderr, as docker logs writes to both
    const subprocess = execa("docker", args, { all: true });
    if (onLine) {
        for await (const line of subprocess.iterable({ from: "all" })) {
            onLine(line);
        }
    }
    const { all, stdout } = await subprocess;
    return all ?? stdout;
};
