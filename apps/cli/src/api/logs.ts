import { execa } from "execa";
import { getProjectName, getServiceInfo } from "../base.js";

export type LogsOptions = {
    /**
     * Name of the project (used by docker compose and cartesi-rollups-node).
     * @default basename of the current working directory
     */
    projectName?: string;

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
     * `follow`, where collecting the whole output is not an option.
     */
    onLine?: (line: string) => void;
};

/**
 * Read the logs of the rollups node of a local environment.
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

    const logOptions: string[] = [];
    if (follow) logOptions.push("--follow");
    if (since) logOptions.push("--since", since);
    if (tail) logOptions.push("--tail", tail);
    if (until) logOptions.push("--until", until);

    const serviceInfo = await getServiceInfo({
        projectName,
        service: "rollups_node",
    });
    if (!serviceInfo) {
        throw new Error(`service rollups_node not found`);
    }

    const args = ["container", "logs", ...logOptions, serviceInfo.ID];

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
