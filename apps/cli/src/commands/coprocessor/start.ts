import { Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import { execa } from "execa";
import path from "path";
import { DEFAULT_SDK_IMAGE, DEFAULT_SDK_VERSION } from "../../config.js";
import { Service, baseServices, host } from "../../service.js";
import { CoprocessorCommandOpts } from "../coprocessor.js";

const coprocessorServices: Service[] = [
    {
        name: "operator",
        file: "coprocessor/docker-compose-operator.yaml",
    },
    {
        name: "solver",
        file: "coprocessor/docker-compose-solver.yaml",
        healthySemaphore: "solver",
        healthyTitle: (port) =>
            `${chalk.cyan("solver")} service ready at ${chalk.cyan(`${host}:${port}/anvil`)}`,
        waitTitle: `${chalk.cyan("solver")} service starting...`,
        errorTitle: `${chalk.red("solver")} service failed`,
    },
];

export const createStartCommand = () => {
    return new Command<[], {}, CoprocessorCommandOpts>("start")
        .description("Start a local rollups node environment.")
        .configureHelp({ showGlobalOptions: true })
        .addOption(
            new Option(
                "--cpus <number>",
                "number of cpu limits for the rollups-node",
            ).argParser(Number),
        )
        .addOption(
            new Option(
                "--memory <number>",
                "memory limit for the rollups-node in MB",
            ).argParser(Number),
        )
        .option("-p, --port <number>", "port to listen on", parseInt, 8080)
        .option("-d, --detach", "run in detached mode", false)
        .option("--dry-run", "show the docker compose configuration", false)
        .option("-v, --verbose", "verbose output", false)
        .action(async (options, command) => {
            const { projectName } = command.optsWithGlobals();
            const { cpus, detach, dryRun, memory, port, verbose } = options;
            // path of the tool instalation
            const binPath = path.join(
                path.dirname(new URL(import.meta.url).pathname),
                "../..",
            );

            // setup the environment variable used in docker compose
            const listenPort = port;
            const env: NodeJS.ProcessEnv = {
                ANVIL_VERBOSITY: verbose ? "--steps-tracing" : "--silent",
                CARTESI_LOG_LEVEL: verbose ? "info" : "error",
                CARTESI_BIN_PATH: binPath,
                CARTESI_LISTEN_PORT: listenPort.toString(),
                CARTESI_COPROCESSOR_NODE_CPUS: cpus?.toString(),
                CARTESI_COPROCESSOR_NODE_MEMORY: memory?.toString(),
                CARTESI_SDK_IMAGE: DEFAULT_SDK_IMAGE,
                CARTESI_SDK_VERSION: DEFAULT_SDK_VERSION,
            };

            // build a list of unique compose files
            const composeFiles = [
                ...new Set(baseServices.map(({ file }) => file)),
                ...new Set(coprocessorServices.map(({ file }) => file)),
            ];

            // cpu and memory limits, mostly for testing and debuggingpurposes
            if (cpus) {
                composeFiles.push("coprocessor/docker-compose-node-cpus.yaml");
            }
            if (memory) {
                composeFiles.push(
                    "coprocessor/docker-compose-node-memory.yaml",
                );
            }

            // create the "--file <file>" list
            const files = composeFiles
                .map((f) => ["--file", path.join(binPath, "compose", f)])
                .flat();

            const compose_args = [
                "compose",
                ...files,
                "--project-name",
                projectName,
            ];

            const up_args = [];

            if (detach) {
                // run in detached mode (background)
                // will need to check logs using docker
                up_args.push("--detach");
            } else {
                if (!verbose) {
                    // attach only to solver, operator and prompt
                    compose_args.push("--progress", "quiet");
                    up_args.push("--attach", "solver");
                    up_args.push("--attach", "operator");
                    up_args.push("--attach", "prompt");
                }
            }

            // XXX: need this handler, so SIGINT can still call the finally block below
            process.on("SIGINT", () => {});

            try {
                if (dryRun) {
                    // show the docker compose configuration
                    await execa("docker", [...compose_args, "config"], {
                        env,
                        stdio: "inherit",
                    });
                    return;
                }

                // run compose environment
                await execa("docker", [...compose_args, "up", ...up_args], {
                    env,
                    stdio: "inherit",
                });
            } catch (e: unknown) {
                // 130 is a graceful shutdown, so we can swallow it
                if ((e as any).exitCode !== 130) {
                    throw e;
                }
            } finally {
                // if it's detached, exit silently, because it's running in the background
                if (!detach) {
                    // shut it down, including volumes
                    await execa(
                        "docker",
                        [...compose_args, "down", "--volumes"],
                        {
                            env,
                            stdio: "inherit",
                        },
                    );
                }
            }
        });
};
