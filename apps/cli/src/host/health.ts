import { type RunningProcess, tailLog } from "./process.js";

/** Error of a service that exited, or did not become ready, on startup. */
export class ServiceStartError extends Error {
    constructor(message: string, log?: string) {
        const tail = log ? tailLog(log) : "";
        super(tail ? `${message}, last lines of ${log}:\n${tail}` : message);
        this.name = "ServiceStartError";
    }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait for a process to become ready, failing as soon as it exits instead of
 * waiting out the whole timeout.
 * @param child the process of the service
 * @param ready resolves true once the service is ready, may throw while it is not
 */
export const waitReady = async (
    child: RunningProcess,
    ready: () => Promise<boolean>,
    options: { interval?: number; timeout?: number } = {},
): Promise<void> => {
    const { interval = 200, timeout = 60_000 } = options;
    let exit:
        | { code: number | null; signal: NodeJS.Signals | null }
        | undefined;
    child.exited.then((value) => {
        exit = value;
    });
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (exit) {
            throw new ServiceStartError(
                `${child.name} exited with ${exit.signal ?? `code ${exit.code}`}`,
                child.log,
            );
        }
        try {
            if (await ready()) {
                return;
            }
        } catch {
            // not yet
        }
        await sleep(interval);
    }
    throw new ServiceStartError(
        `${child.name} did not become ready in ${timeout / 1000}s`,
        child.log,
    );
};

/** Whether an HTTP endpoint answers with a success status. */
export const httpOk = async (url: string): Promise<boolean> => {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
};

/** Send a JSON-RPC request, returning its result. */
export const jsonRpc = async <T = unknown>(
    url: string,
    method: string,
    params: unknown[] = [],
): Promise<T> => {
    const response = await fetch(url, {
        body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(2_000),
    });
    const body = (await response.json()) as {
        result?: T;
        error?: { message: string };
    };
    if (body.error) {
        throw new Error(body.error.message);
    }
    return body.result as T;
};
