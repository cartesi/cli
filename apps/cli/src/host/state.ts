import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ForkConfig } from "../types/chain.js";
import { type HostProcess, isAlive, isGroupAlive } from "./process.js";

/**
 * Everything a local environment keeps on the host lives under one directory
 * of the temporary directory of the system, removed when it stops: the
 * database, the logs, the data of the PRT nodes and of the withdrawals.
 * The project only gets read from, its `.cartesi` directory included.
 */
export const environmentsRoot = (): string => {
    const uid = typeof process.getuid === "function" ? process.getuid() : 0;
    return path.join(os.tmpdir(), `cartesi-${uid}`);
};

/** A project name that is safe as a directory name. */
const directoryName = (projectName: string) =>
    projectName.replaceAll(/[^A-Za-z0-9._-]/g, "_");

/** Directory of the environment of a project. */
export const environmentDir = (projectName: string): string =>
    path.join(environmentsRoot(), directoryName(projectName));

const stateFile = (dir: string) => path.join(dir, "environment.json");

/**
 * What another CLI process needs to know about a running environment, kept in
 * its directory: `cartesi send`, `cartesi logs` and the like read it, instead
 * of asking docker.
 */
export type EnvironmentState = {
    version: 1;
    projectName: string;
    /** The CLI process that owns the environment, and serves its proxy. */
    pid: number;
    dir: string;
    port: number;
    startedAt: string;
    /** URL of anvil, without the proxy. */
    anvilUrl: string;
    forkConfig?: { url: string; blockNumber?: string; chainId: number };
    /**
     * Environment of the rollups node, which `cartesi-rollups-cli` runs with,
     * as it did inside the node container.
     */
    nodeEnv: Record<string, string>;
    /** Machine snapshot the application is deployed from. */
    templatePath: string;
    /** Where the withdrawals replay machines and keep proofs. */
    workDir: string;
    /** Every process started, in start order, the exited ones included. */
    processes: HostProcess[];
};

export const toStateForkConfig = (
    forkConfig: ForkConfig | undefined,
): EnvironmentState["forkConfig"] =>
    forkConfig && {
        blockNumber: forkConfig.blockNumber?.toString(),
        chainId: forkConfig.chainId,
        url: forkConfig.url,
    };

/**
 * Write the state of an environment. It holds the signer of the node, so only
 * the user can read it.
 */
export const writeState = (state: EnvironmentState) => {
    const file = stateFile(state.dir);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
};

/** Read the state of an environment, running or not. */
export const readState = (
    projectName: string,
): EnvironmentState | undefined => {
    try {
        const content = fs.readFileSync(
            stateFile(environmentDir(projectName)),
            "utf-8",
        );
        return JSON.parse(content) as EnvironmentState;
    } catch {
        return undefined;
    }
};

/**
 * Whether the environment is still served: its owner, which runs the proxy,
 * is alive.
 */
export const isRunning = (state: EnvironmentState): boolean =>
    isAlive(state.pid);

/**
 * Read the state of the running environment of a project.
 * @throws when the project is not running
 */
export const requireState = (projectName: string): EnvironmentState => {
    const state = readState(projectName);
    if (!state || !isRunning(state)) {
        throw new Error(
            `project '${projectName}' is not running, use 'cartesi run'`,
        );
    }
    return state;
};

/** State of a service of an environment, as `docker compose ps` reported it. */
export const serviceState = (
    state: EnvironmentState | undefined,
    service: string,
): "running" | "exited" | undefined => {
    if (!state) {
        return undefined;
    }
    // the latest process of the service, a PRT node is restarted on redeploy
    const latest = [...state.processes]
        .reverse()
        .find(({ name }) => name === service);
    if (!latest) {
        return undefined;
    }
    return isRunning(state) && isGroupAlive(latest.pid) ? "running" : "exited";
};
