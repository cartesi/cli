import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import getPort from "get-port";
import { Listr } from "listr2";
import type { Address } from "viem";
import type { CartesiEnvironmentVariables } from "../base.js";
import type { ResolvedPrtNode } from "../prt.js";
import type { ForkConfig } from "../types/chain.js";
import { anvilProcess, anvilReady, devnetState } from "./anvil.js";
import { httpOk, ServiceStartError, waitReady } from "./health.js";
import { NODE_SERVICE, nodeEnvironment, nodeProcess } from "./node.js";
import { findPostgres, migrateDatabase, startPostgres } from "./postgres.js";
import {
    type HostProcess,
    isGroupAlive,
    type ProcessSpec,
    type RunningProcess,
    startProcess,
    stopProcess,
    stopProcessesSync,
} from "./process.js";
import { type HostProxy, type Route, startProxy } from "./proxy.js";
import { prtNodeProcesses } from "./prt-node.js";
import {
    bundlerProcess,
    passkeyProcess,
    paymasterProcess,
} from "./services.js";
import {
    type EnvironmentState,
    environmentDir,
    environmentsRoot,
    isRunning,
    readState,
    toStateForkConfig,
    writeState,
} from "./state.js";
import { assertHostTools } from "./tools.js";

export const host = "http://127.0.0.1";

/** The optional services, by the name `--services` takes. */
export const AVAILABLE_SERVICES = ["bundler", "paymaster", "passkey"];

/** Every optional service the option selects, `all` being all of them. */
export const selectServices = (services: string[]): string[] => {
    if (services.length === 1 && services[0] === "all") {
        return AVAILABLE_SERVICES;
    }
    if (services.includes("explorer")) {
        throw new Error(
            "the explorer service is only available as a docker image, which 'cartesi run' no longer uses",
        );
    }
    const unknown = services.filter(
        (name) => !AVAILABLE_SERVICES.includes(name),
    );
    if (unknown.length > 0) {
        throw new Error(
            `unknown service ${unknown.join(", ")}, expected one of ${AVAILABLE_SERVICES.join(", ")}`,
        );
    }
    // the paymaster sends the user operations it sponsors to the bundler
    return services.includes("paymaster") && !services.includes("bundler")
        ? [...services, "bundler"]
        : services;
};

export type EnvironmentOptions = {
    blockTime: number;
    cartesiEnvironmentVariables?: CartesiEnvironmentVariables;
    /** false puts the node in reader mode, when a sling node claims */
    claimSubmission?: boolean;
    defaultBlock: "latest" | "safe" | "finalized";
    forkConfig?: ForkConfig;
    port: number;
    projectName: string;
    prt?: boolean;
    services: string[];
    verbose: boolean;
};

/** A running environment, served by this process. */
export type Environment = {
    readonly state: EnvironmentState;
    /** Resolves when the environment stops, on its own or by `stop`. */
    exited: Promise<void>;
    /**
     * Start the PRT nodes the CLI runs for a deployed application.
     * @returns the names of the services started
     */
    startPrtNodes(options: {
        application: Address;
        nodes: ResolvedPrtNode[];
    }): Promise<string[]>;
    /** Stop the PRT nodes, before the application they claim for is undeployed. */
    stopPrtNodes(services: string[]): Promise<void>;
    /** Stop every process and remove everything the environment kept. */
    stop(): Promise<void>;
};

/** What the environment would run, for a dry run. */
export type EnvironmentPlan = {
    dir: string;
    port: number;
    processes: ProcessSpec[];
    routes: Route[];
};

/** Ports of the services behind the proxy. */
type Ports = Record<
    | "anvil"
    | "bundler"
    | "database"
    | "inspect"
    | "jsonrpc"
    | "passkey"
    | "paymaster"
    | "telemetry",
    number
>;

const allocatePorts = async (exclude: number[]): Promise<Ports> => {
    const names = [
        "anvil",
        "bundler",
        "database",
        "inspect",
        "jsonrpc",
        "passkey",
        "paymaster",
        "telemetry",
    ] as const;
    const ports: Partial<Ports> = {};
    const taken = [...exclude];
    for (const name of names) {
        const port = await getPort({ exclude: taken, host: "127.0.0.1" });
        taken.push(port);
        ports[name] = port;
    }
    return ports as Ports;
};

const routesOf = (ports: Ports, services: string[]): Route[] => [
    { port: ports.anvil, prefix: "/anvil", strip: true },
    { cors: true, port: ports.jsonrpc, prefix: "/rpc" },
    { cors: true, port: ports.inspect, prefix: "/inspect" },
    ...(services.includes("bundler")
        ? [
              {
                  cors: true,
                  port: ports.bundler,
                  prefix: "/bundler/",
                  strip: true,
              },
          ]
        : []),
    ...(services.includes("paymaster")
        ? [{ port: ports.paymaster, prefix: "/paymaster/", strip: true }]
        : []),
    ...(services.includes("passkey")
        ? [{ port: ports.passkey, prefix: "/passkey/", strip: true }]
        : []),
];

const optionalProcesses = (
    ports: Ports,
    services: string[],
    anvilUrl: string,
): ProcessSpec[] => [
    ...(services.includes("bundler")
        ? [bundlerProcess({ anvilUrl, port: ports.bundler })]
        : []),
    ...(services.includes("paymaster")
        ? [
              paymasterProcess({
                  anvilUrl,
                  bundlerUrl: `${host}:${ports.bundler}`,
                  port: ports.paymaster,
              }),
          ]
        : []),
    ...(services.includes("passkey")
        ? [passkeyProcess({ port: ports.passkey })]
        : []),
];

/** Health endpoint of each optional service. */
const optionalHealth = (ports: Ports): Record<string, string> => ({
    bundler: `${host}:${ports.bundler}/health`,
    passkey_server: `${host}:${ports.passkey}/health`,
    paymaster: `${host}:${ports.paymaster}/ping`,
});

/** Directory of the machine snapshot the application is deployed from. */
const projectSnapshotsDir = () => path.resolve(".cartesi");

/**
 * Describe the environment without starting it, as `--dry-run` shows it.
 * Ports are picked again when it starts.
 */
export const planEnvironment = async (
    options: EnvironmentOptions,
): Promise<EnvironmentPlan> => {
    const { port, projectName } = options;
    const services = selectServices(options.services);
    const dir = environmentDir(projectName);
    const ports = await allocatePorts([port]);
    const anvilUrl = `${host}:${ports.anvil}`;
    const postgres = await findPostgres();
    const processes: ProcessSpec[] = [
        {
            args: [
                "-D",
                path.join(dir, "postgres"),
                "-p",
                ports.database.toString(),
            ],
            command: postgres.postgres,
            name: "database",
        },
        anvilProcess({
            blockTime: options.blockTime,
            forkConfig: options.forkConfig,
            port: ports.anvil,
            state: options.forkConfig ? undefined : "<devnet state>",
        }),
        nodeProcess(
            nodeEnvironment({
                anvilUrl,
                cartesiEnvironmentVariables:
                    options.cartesiEnvironmentVariables,
                claimSubmission: options.claimSubmission,
                databaseUrl: `postgres://postgres:<password>@127.0.0.1:${ports.database}/rollupsdb?sslmode=disable`,
                defaultBlock: options.defaultBlock,
                forkChainId: options.forkConfig?.chainId,
                logLevel: options.verbose ? "debug" : "info",
                ports,
                prt: options.prt,
                snapshotsDir: projectSnapshotsDir(),
            }),
        ),
        ...optionalProcesses(ports, services, anvilUrl),
    ];
    return { dir, port, processes, routes: routesOf(ports, services) };
};

/**
 * Stop what is left of an environment whose CLI process died without
 * stopping it, a kill -9 for one, and remove its directory.
 */
export const removeStaleEnvironment = async (projectName: string) => {
    const state = readState(projectName);
    if (state && isRunning(state)) {
        throw new Error(
            `project '${projectName}' is already running (pid ${state.pid}), stop it first or use another --project-name`,
        );
    }
    if (state) {
        await Promise.all(
            [...state.processes].reverse().map((p) => stopProcess(p, 5_000)),
        );
    }
    fs.rmSync(environmentDir(projectName), { force: true, recursive: true });
};

/** Required tools of the environment, by the services it runs. */
export const requiredTools = (services: string[]) => [
    "anvil",
    "cartesi-rollups-cli",
    "cartesi-rollups-node",
    "cartesi-jsonrpc-machine",
    ...(services.includes("bundler") ? ["alto"] : []),
    ...(services.includes("paymaster") ? ["mock-verifying-paymaster"] : []),
    ...(services.includes("passkey") ? ["passkey-server"] : []),
];

/**
 * Check the environment can start, before anything is: the services are
 * known, the tools they need are installed, and the project is not running.
 * Removes what is left of a previous run of the project that died.
 * @returns the optional services to start
 */
export const prepareEnvironment = async (
    options: Pick<EnvironmentOptions, "projectName" | "services">,
): Promise<string[]> => {
    const services = selectServices(options.services);
    const postgres = await findPostgres();
    assertHostTools([
        ...requiredTools(services),
        postgres.initdb,
        postgres.postgres,
    ]);
    await removeStaleEnvironment(options.projectName);
    return services;
};

/**
 * Start the environment: postgres and anvil, then the rollups node, then the
 * optional services, each one a process of the host, behind a proxy served by
 * this process, which owns the environment. Shows their startup as `renderer`
 * says.
 *
 * Whatever is started is stopped, and everything the environment kept on the
 * host is removed, when the environment stops, fails to start, or the process
 * exits without stopping it.
 */
export const startEnvironment = async (
    options: EnvironmentOptions & {
        renderer?: "default" | "silent" | "verbose";
    },
): Promise<Environment> => {
    const { port, projectName, renderer = "default" } = options;
    const services = await prepareEnvironment(options);
    fs.mkdirSync(environmentsRoot(), { mode: 0o700, recursive: true });
    const dir = environmentDir(projectName);
    const logs = path.join(dir, "logs");
    fs.mkdirSync(logs, { mode: 0o700, recursive: true });

    const ports = await allocatePorts([port]);
    const anvilUrl = `${host}:${ports.anvil}`;
    const state: EnvironmentState = {
        anvilUrl,
        dir,
        forkConfig: toStateForkConfig(options.forkConfig),
        nodeEnv: {},
        pid: process.pid,
        port,
        processes: [],
        projectName,
        startedAt: new Date().toISOString(),
        templatePath: path.join(projectSnapshotsDir(), "image"),
        version: 1,
        workDir: path.join(dir, "withdraw"),
    };

    const running: RunningProcess[] = [];
    let stopped = false;

    // the root of the environments goes too, when this was the last one
    const removeDirectory = () => {
        fs.rmSync(dir, { force: true, recursive: true });
        try {
            fs.rmdirSync(environmentsRoot());
        } catch {
            // another environment is running
        }
    };

    // the safety net: a process that exits, or is killed by a signal nobody
    // handles, takes the environment down with it
    const cleanupSync = () => {
        if (stopped) {
            return;
        }
        stopped = true;
        stopProcessesSync(running.filter(({ pid }) => isGroupAlive(pid)));
        removeDirectory();
    };
    const signals: NodeJS.Signals[] = ["SIGHUP", "SIGINT", "SIGTERM"];
    const onSignal = (signal: NodeJS.Signals) => {
        // somebody else handles it, and decides when to stop
        if (process.listenerCount(signal) > 1) {
            return;
        }
        cleanupSync();
        removeHooks();
        process.kill(process.pid, signal);
    };
    const removeHooks = () => {
        process.removeListener("exit", cleanupSync);
        for (const signal of signals) {
            process.removeListener(signal, onSignal);
        }
    };
    process.on("exit", cleanupSync);
    for (const signal of signals) {
        process.on(signal, onSignal);
    }

    const spawn = async (spec: ProcessSpec): Promise<RunningProcess> => {
        if (stopped) {
            throw new Error("the environment stopped");
        }
        const child = await startProcess(
            spec,
            path.join(logs, `${spec.name}.log`),
        );
        running.push(child);
        state.processes.push({
            log: child.log,
            name: child.name,
            pid: child.pid,
            stopSignal: child.stopSignal,
        });
        writeState(state);
        return child;
    };

    let proxy: HostProxy | undefined;
    let resolveExited: () => void = () => {};
    const exited = new Promise<void>((resolve) => {
        resolveExited = resolve;
    });

    const stopAll = async () => {
        if (stopped) {
            return;
        }
        stopped = true;
        // the reverse of the start order: the dependents go first
        for (const child of [...running].reverse()) {
            await stopProcess(child);
        }
        await proxy?.close();
        removeDirectory();
        removeHooks();
        resolveExited();
    };

    try {
        // the port of the environment is taken first, so a busy one fails at once
        proxy = await startProxy(port);
        proxy.setRoutes(routesOf(ports, services));
        writeState(state);

        const database = (async () => {
            const { url } = await startPostgres({
                dir,
                log: path.join(logs, "database.log"),
                onStart: (child) => {
                    running.push(child);
                    state.processes.push({
                        log: child.log,
                        name: child.name,
                        pid: child.pid,
                        stopSignal: child.stopSignal,
                    });
                    writeState(state);
                },
                port: ports.database,
            });
            await migrateDatabase(url);
            return url;
        })();

        const anvil = (async () => {
            const stateFile = options.forkConfig
                ? undefined
                : await devnetState();
            const child = await spawn(
                anvilProcess({
                    blockTime: options.blockTime,
                    forkConfig: options.forkConfig,
                    port: ports.anvil,
                    state: stateFile,
                }),
            );
            await waitReady(
                child,
                () => anvilReady(anvilUrl, options.forkConfig),
                {
                    timeout: options.forkConfig ? 120_000 : 30_000,
                },
            );
            return child;
        })();

        const node = (async () => {
            const [databaseUrl] = await Promise.all([database, anvil]);
            state.nodeEnv = nodeEnvironment({
                anvilUrl,
                cartesiEnvironmentVariables:
                    options.cartesiEnvironmentVariables,
                claimSubmission: options.claimSubmission,
                databaseUrl,
                defaultBlock: options.defaultBlock,
                forkChainId: options.forkConfig?.chainId,
                logLevel: options.verbose ? "debug" : "info",
                ports,
                prt: options.prt,
                snapshotsDir: projectSnapshotsDir(),
            });
            const child = await spawn(nodeProcess(state.nodeEnv));
            await waitReady(child, () =>
                httpOk(`${host}:${ports.telemetry}/livez`),
            );
            return child;
        })();

        const health = optionalHealth(ports);
        const optional = new Map<string, Promise<RunningProcess>>();
        for (const spec of optionalProcesses(ports, services, anvilUrl)) {
            const after =
                spec.name === "paymaster"
                    ? Promise.all([anvil, optional.get("bundler")])
                    : spec.name === "bundler"
                      ? anvil
                      : Promise.resolve();
            optional.set(
                spec.name,
                after.then(async () => {
                    const child = await spawn(spec);
                    const url = health[spec.name];
                    await waitReady(child, () => httpOk(url));
                    return child;
                }),
            );
        }

        const jobs = [database, anvil, node, ...optional.values()];
        const task = (title: string, job: Promise<unknown>, ready: string) => ({
            task: async (_ctx: unknown, task: { title: string }) => {
                await job;
                task.title = ready;
            },
            title,
        });
        const ready = (name: string, url: string) =>
            `${chalk.cyan(name)} service ready at ${chalk.cyan(url)}`;
        const starting = (name: string) =>
            `${chalk.cyan(name)} service starting...`;
        const url = `${host}:${port}`;
        try {
            await new Listr(
                [
                    task(
                        starting("anvil"),
                        anvil,
                        ready("anvil", `${url}/anvil`),
                    ),
                    task(starting("rpc"), node, ready("rpc", `${url}/rpc`)),
                    task(
                        starting("inspect"),
                        node,
                        ready("inspect", `${url}/inspect/${projectName}`),
                    ),
                    ...services.map((name) => {
                        const job = optional.get(
                            name === "passkey" ? "passkey_server" : name,
                        ) as Promise<unknown>;
                        const path =
                            name === "bundler" ? "/bundler/rpc" : `/${name}`;
                        return task(
                            starting(name),
                            job,
                            ready(name, `${url}${path}`),
                        );
                    }),
                ],
                { concurrent: true, exitOnError: true, renderer },
            ).run();
        } finally {
            // nothing may still be starting when the environment is torn down
            await Promise.allSettled(jobs);
        }
        // a failure the progress did not show, the database's for one
        await Promise.all(jobs);
    } catch (error: unknown) {
        await stopAll();
        throw error;
    }

    // the environment is down when one of its core services is
    const core = running.filter(({ name }) =>
        ["anvil", "database", NODE_SERVICE].includes(name),
    );
    Promise.race(core.map(({ exited }) => exited)).then(() => {
        if (!stopped) {
            stopAll();
        }
    });

    return {
        exited,
        startPrtNodes: async ({ application, nodes }) => {
            const specs = prtNodeProcesses({
                anvilUrl,
                application,
                blockTime: options.blockTime,
                dir,
                nodes,
                templatePath: state.templatePath,
            });
            if (specs.length === 0) {
                return [];
            }
            assertHostTools(["cartesi-sling-node"]);
            const children = [];
            for (const spec of specs) {
                const dataDir = spec.env?.CARTESI_SLING_DATA_DIR;
                if (dataDir) {
                    fs.mkdirSync(dataDir, { recursive: true });
                }
                children.push(await spawn(spec));
            }
            // a node that exits at once, e.g. on a bad key, fails here
            await new Promise((resolve) => setTimeout(resolve, 1_000));
            for (const child of children) {
                if (!isGroupAlive(child.pid)) {
                    throw new ServiceStartError(
                        `${child.name} exited on startup`,
                        child.log,
                    );
                }
            }
            return children.map(({ name }) => name);
        },
        get state() {
            return state;
        },
        stop: stopAll,
        stopPrtNodes: async (names) => {
            const targets = running.filter(
                ({ name, pid }) => names.includes(name) && isGroupAlive(pid),
            );
            await Promise.all(targets.map((child) => stopProcess(child)));
        },
    };
};

export type { HostProcess };
