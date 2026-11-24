import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";

/**
 * A process of the local environment, as it is started: the executable is
 * looked up in the `PATH` of the host.
 */
export type ProcessSpec = {
    /** Name of the service the process runs, as `cartesi logs` lists it. */
    name: string;
    command: string;
    args: string[];
    /** Variables added to the environment of the process. */
    env?: Record<string, string>;
    cwd?: string;
    /**
     * Signal that asks the process to stop. Postgres, for one, only stops
     * once every client disconnected when it gets the default.
     * @default "SIGTERM"
     */
    stopSignal?: NodeJS.Signals;
};

/** A process of the environment that was started. */
export type HostProcess = {
    name: string;
    /** Also the id of its process group, which it leads. */
    pid: number;
    log: string;
    stopSignal: NodeJS.Signals;
};

export type RunningProcess = HostProcess & {
    /** Resolves when the process exits, with its exit code or signal. */
    exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
    child: ChildProcess;
};

/**
 * The environment a process starts with: the host's, so it finds its
 * libraries and tools, but none of its `CARTESI_` variables, as the ones a
 * service should see are given to it explicitly.
 */
export const baseEnvironment = (
    env: NodeJS.ProcessEnv = process.env,
): Record<string, string> =>
    Object.fromEntries(
        Object.entries(env).filter(
            (entry): entry is [string, string] =>
                entry[1] !== undefined && !entry[0].startsWith("CARTESI_"),
        ),
    );

/** Error of a process the host could not start. */
export class ProcessStartError extends Error {
    constructor(spec: ProcessSpec, cause: unknown) {
        const code = (cause as NodeJS.ErrnoException | undefined)?.code;
        super(
            code === "ENOENT"
                ? `${spec.command} not found, it must be installed on the host to run the ${spec.name} service`
                : `${spec.name} failed to start: ${(cause as Error)?.message ?? cause}`,
            { cause },
        );
        this.name = "ProcessStartError";
    }
}

/**
 * Start a process of the environment, writing its output to `log`.
 *
 * Every process leads its own process group, so the processes it spawns
 * itself (the machines of the rollups node, for one) are stopped along with
 * it, and a Ctrl+C on the terminal of the CLI reaches only the CLI, which
 * decides when the environment stops.
 */
export const startProcess = async (
    spec: ProcessSpec,
    log: string,
): Promise<RunningProcess> => {
    const fd = fs.openSync(log, "a", 0o600);
    try {
        const child = spawn(spec.command, spec.args, {
            cwd: spec.cwd,
            detached: true,
            env: { ...baseEnvironment(), ...spec.env },
            stdio: ["ignore", fd, fd],
        });
        // spawn reports a missing executable asynchronously
        await new Promise<void>((resolve, reject) => {
            child.once("spawn", resolve);
            child.once("error", (error) =>
                reject(new ProcessStartError(spec, error)),
            );
        });
        const exited = new Promise<{
            code: number | null;
            signal: NodeJS.Signals | null;
        }>((resolve) =>
            child.once("exit", (code, signal) => resolve({ code, signal })),
        );
        // the environment stays up on its own, only stop() ends it
        child.unref();
        return {
            child,
            exited,
            log,
            name: spec.name,
            pid: child.pid as number,
            stopSignal: spec.stopSignal ?? "SIGTERM",
        };
    } finally {
        fs.closeSync(fd);
    }
};

/** Whether a process group still has a process in it. */
export const isGroupAlive = (pid: number): boolean => {
    try {
        process.kill(-pid, 0);
        return true;
    } catch (error: unknown) {
        // EPERM: it exists, but is not ours to signal
        return (error as NodeJS.ErrnoException).code === "EPERM";
    }
};

/** Whether a process is still running. */
export const isAlive = (pid: number): boolean => {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error: unknown) {
        return (error as NodeJS.ErrnoException).code === "EPERM";
    }
};

const signalGroup = (pid: number, signal: NodeJS.Signals) => {
    try {
        process.kill(-pid, signal);
    } catch {
        // already gone
    }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Stop a process and every process of its group: ask it to stop, then kill
 * what is left once `timeout` expires. Works for processes started by
 * another CLI process too, which can only be polled.
 */
export const stopProcess = async (
    target: HostProcess,
    timeout = 10_000,
): Promise<void> => {
    const { pid, stopSignal } = target;
    if (!isGroupAlive(pid)) {
        return;
    }
    signalGroup(pid, stopSignal);
    const deadline = Date.now() + timeout;
    while (isGroupAlive(pid) && Date.now() < deadline) {
        await sleep(100);
    }
    // anything left of the group, the leader may have exited before its children
    signalGroup(pid, "SIGKILL");
};

const sleepSync = (ms: number) =>
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Stop processes from a synchronous context, such as an `exit` handler,
 * which cannot wait on a promise. Waits a little for a graceful stop, as
 * postgres cleans up after itself on one, and kills what is left.
 */
export const stopProcessesSync = (
    processes: HostProcess[],
    timeout = 3_000,
) => {
    for (const { pid, stopSignal } of processes) {
        signalGroup(pid, stopSignal);
    }
    const deadline = Date.now() + timeout;
    while (
        processes.some(({ pid }) => isGroupAlive(pid)) &&
        Date.now() < deadline
    ) {
        sleepSync(50);
    }
    for (const { pid } of processes) {
        signalGroup(pid, "SIGKILL");
    }
};

/**
 * The last lines of a log, to explain why a process did not come up.
 */
export const tailLog = (log: string, lines = 20): string => {
    try {
        const content = fs.readFileSync(log, "utf-8").trimEnd();
        return content.split("\n").slice(-lines).join("\n");
    } catch {
        return "";
    }
};
