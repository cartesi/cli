import { Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import { execa } from "execa";
import path from "path";

const commaSeparatedList = (value: string, _previous: string[]) =>
    value.split(",");

const availableServices = [
    "bundler",
    "explorer",
    "graphql",
    // "otterscan",
    "paymaster",
];

export const registerStartCommand = (program: Command) => {
    program
        .command("start")
        .addOption(
            new Option(
                "--block-time <number>",
                "interval between blocks (in seconds)",
            )
                .argParser(Number)
                .default(5),
        )
        .addOption(
            new Option(
                "--default-block <string>",
                "default block to be used when fetching new blocks.",
            )
                .choices(["latest", "safe", "pending", "finalized"])
                .default("finalized"),
        )
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
        .option(
            "--project-name <string>",
            "name of environment",
            "cartesi-rollups",
        )
        .option(
            "--services <string>",
            `optional services to start, comma separated list from [${availableServices.join(", ")}]`,
            commaSeparatedList,
            [],
        )
        .option("-p, --port <number>", "port to listen on", parseInt, 8080)
        .option("-d, --detach", "run in detached mode", false)
        .option("--dry-run", "show the docker compose configuration", false)
        .option("-v, --verbose", "verbose output", false)
        .description("Start a local rollups node environment.")
        .action(async (options) => {
            const {
                blockTime,
                cpus,
                defaultBlock,
                detach,
                dryRun,
                memory,
                port,
                projectName,
                services,
                verbose,
            } = options;
            // path of the tool instalation
            const binPath = path.join(
                path.dirname(new URL(import.meta.url).pathname),
                "../..",
            );

            // setup the environment variable used in docker compose
            const listenPort = port;
            const env: NodeJS.ProcessEnv = {
                ANVIL_VERBOSITY: verbose ? "--steps-tracing" : "--silent",
                BLOCK_TIME: blockTime.toString(),
                CARTESI_BLOCKCHAIN_DEFAULT_BLOCK: defaultBlock,
                CARTESI_LOG_LEVEL: verbose ? "info" : "error",
                CARTESI_BIN_PATH: binPath,
                CARTESI_LISTEN_PORT: listenPort.toString(),
                CARTESI_ROLLUPS_NODE_CPUS: cpus?.toString(),
                CARTESI_ROLLUPS_NODE_MEMORY: memory?.toString(),
            };

            const composeFiles = [
                "docker-compose-anvil.yaml",
                "docker-compose-proxy.yaml",
                "docker-compose-database.yaml",
                "docker-compose-node.yaml",
                "docker-compose-prompt.yaml",
            ];

            // cpu and memory limits, mostly for testing and debuggingpurposes
            if (cpus) {
                composeFiles.push("docker-compose-node-cpus.yaml");
            }
            if (memory) {
                composeFiles.push("docker-compose-node-memory.yaml");
            }

            const optionalServices =
                services.length === 1 && services[0] === "all"
                    ? availableServices
                    : services;

            // validate services and add to compose files
            for (const service of optionalServices) {
                if (!availableServices.includes(service)) {
                    throw new Error(
                        `Service ${chalk.cyan(service)} not available`,
                    );
                } else {
                    composeFiles.push(`docker-compose-${service}.yaml`);
                }
            }

            // create the "--file <file>" list
            const files = composeFiles
                .map((f) => [
                    "--file",
                    path.join(binPath, "compose", "rollups", f),
                ])
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
                    // attach only to rollups-node and prompt
                    compose_args.push("--progress", "quiet");
                    up_args.push("--attach", "rollups-node");
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
