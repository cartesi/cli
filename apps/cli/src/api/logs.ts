import fs from "node:fs";
import { getProjectName } from "../base.js";
import { NODE_SERVICE } from "../host/node.js";
import { isPrtNodeService } from "../host/prt-node.js";
import { readState } from "../host/state.js";

export { NODE_SERVICE };

/**
 * The services of an environment, in the order they started; an exited one
 * is still listed, so its last logs can be read.
 */
export const listServices = async (projectName: string): Promise<string[]> => {
    const state = readState(projectName);
    return [...new Set(state?.processes.map(({ name }) => name) ?? [])];
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
    const unknown = requested.filter((service) => !services.includes(service));
    if (unknown.length > 0) {
        throw new Error(
            `service ${unknown.join(", ")} not found; the environment has ${services.join(", ")}`,
        );
    }
    return requested;
};

/**
 * The last lines of a log, as `--tail` selects them.
 * @param tail number of lines, or "all"
 */
export const tailLines = (content: string, tail: string): string[] => {
    const lines = content.split("\n");
    // the line a newline ends is not followed by another one
    if (lines.at(-1) === "") {
        lines.pop();
    }
    if (tail === "all") {
        return lines;
    }
    const count = Number.parseInt(tail, 10);
    if (Number.isNaN(count) || count < 0) {
        throw new Error(`invalid --tail ${tail}, expected a number or "all"`);
    }
    return count === 0 ? [] : lines.slice(-count);
};

/**
 * The prefix of each line of a service. One service is shown as it is; more
 * than one get a prefix, as compose did, which tells the node's lines from
 * the PRT nodes'.
 */
export const linePrefix = (services: string[], service: string): string => {
    if (services.length < 2) {
        return "";
    }
    const width = Math.max(...services.map((name) => name.length));
    return `${service.padEnd(width)}  | `;
};

export type LogsOptions = {
    /**
     * Name of the project (used by cartesi-rollups-node).
     * @default basename of the current working directory
     */
    projectName?: string;

    /**
     * Services to show, as `run` names them.
     * @default the node followed by every PRT node
     */
    services?: string[];

    /**
     * Follow log output, until the environment stops or the process gets a
     * SIGINT (a Ctrl+C).
     */
    follow?: boolean;

    /**
     * Number of lines to show from the end of the logs.
     * @default "all"
     */
    tail?: string;

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

/** How often a followed log is checked for new lines. */
const FOLLOW_INTERVAL = 200;

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
    const { follow, onLine, stream = false, tail = "all" } = options;
    const projectName = getProjectName(options);
    const state = readState(projectName);

    const services = selectLogServices(
        await listServices(projectName),
        options.services ?? [],
    );

    const collected: string[] = [];
    const emit = (line: string) => {
        if (onLine) {
            onLine(line);
        } else if (stream) {
            process.stdout.write(`${line}\n`);
        } else {
            collected.push(line);
        }
    };

    // a service restarted by a redeploy, a PRT node, keeps writing to its log
    const files = services.map((service) => {
        const log = state?.processes.find(({ name }) => name === service)?.log;
        return { log, prefix: linePrefix(services, service), service };
    });

    const offsets = new Map<string, number>();
    for (const { log, prefix } of files) {
        if (!log) {
            continue;
        }
        let content = "";
        try {
            content = fs.readFileSync(log, "utf-8");
        } catch {
            // removed with its environment
        }
        offsets.set(log, Buffer.byteLength(content));
        for (const line of tailLines(content, tail)) {
            emit(`${prefix}${line}`);
        }
    }

    if (follow) {
        await new Promise<void>((resolve) => {
            const partial = new Map<string, string>();
            const poll = () => {
                for (const { log, prefix } of files) {
                    if (!log) {
                        continue;
                    }
                    let size: number;
                    try {
                        size = fs.statSync(log).size;
                    } catch {
                        // the environment stopped and took its logs along
                        stop();
                        return;
                    }
                    const offset = offsets.get(log) ?? 0;
                    if (size <= offset) {
                        continue;
                    }
                    const fd = fs.openSync(log, "r");
                    const buffer = Buffer.alloc(size - offset);
                    fs.readSync(fd, buffer, 0, buffer.length, offset);
                    fs.closeSync(fd);
                    offsets.set(log, size);
                    const text =
                        (partial.get(log) ?? "") + buffer.toString("utf-8");
                    const lines = text.split("\n");
                    partial.set(log, lines.pop() ?? "");
                    for (const line of lines) {
                        emit(`${prefix}${line}`);
                    }
                }
            };
            const timer = setInterval(poll, FOLLOW_INTERVAL);
            const stop = () => {
                clearInterval(timer);
                process.removeListener("SIGINT", stop);
                resolve();
            };
            // a Ctrl+C ends the following, not the process
            process.on("SIGINT", stop);
        });
    }

    if (stream || onLine) {
        return stream ? undefined : "";
    }
    return collected.join("\n");
};
