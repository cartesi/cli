import { Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import { execa } from "execa";
import { Listr, ListrTask } from "listr2";
import pRetry from "p-retry";
import path from "path";
import { getServiceHealth } from "../../base.js";
import { DEFAULT_SDK } from "../../config.js";
import { RollupsCommandOpts } from "../rollups.js";

const commaSeparatedList = (value: string, _previous: string[]) =>
    value.split(",");

type Service = {
    name: string; // name of the service
    file: string; // docker compose file name
    healthySemaphore?: string; // service to check if the service is healthy
    healthyTitle?: string | ((port: number) => string); // title of the service when it is healthy
    waitTitle?: string; // title of the service when it is starting
    errorTitle?: string; // title of the service when it is not healthy
};

const host = "http://127.0.0.1";

// services configuration
const baseServices: Service[] = [
    {
        name: "anvil",
        file: "docker-compose-anvil.yaml",
        healthySemaphore: "anvil",
        healthyTitle: `${chalk.cyan("anvil")} service ready at ${chalk.cyan(`${host}:8545`)}`,
        waitTitle: `${chalk.cyan("anvil")} service starting...`,
        errorTitle: `${chalk.red("anvil")} service failed`,
    },
    {
        name: "proxy",
        file: "docker-compose-proxy.yaml",
    },
    {
        name: "database",
        file: "docker-compose-database.yaml",
    },
    {
        name: "rpc",
        file: "docker-compose-node.yaml",
        healthySemaphore: "proxy",
        healthyTitle: (port) =>
            `${chalk.cyan("rpc")} service ready at ${chalk.cyan(`${host}:${port}/rpc`)}`,
        waitTitle: `${chalk.cyan("rpc")} service starting...`,
        errorTitle: `${chalk.red("rpc")} service failed`,
    },
    {
        name: "inspect",
        file: "docker-compose-node.yaml",
        healthySemaphore: "proxy",
        healthyTitle: (port) =>
            `${chalk.cyan("inspect")} service ready at ${chalk.cyan(`${host}:${port}/inspect/<application_address>`)}`,
        waitTitle: `${chalk.cyan("inspect")} service starting...`,
        errorTitle: `${chalk.red("inspect")} service failed`,
    },
];

const availableServices: Service[] = [
    {
        name: "bundler",
        file: "docker-compose-bundler.yaml",
        healthySemaphore: "proxy",
        healthyTitle: (port) =>
            `Service ${chalk.cyan("bundler")} ready at ${chalk.cyan(`${host}:${port}/bundler/rpc`)}`,
        waitTitle: `Starting ${chalk.cyan("bundler")}...`,
        errorTitle: `Service ${chalk.red("bundler")} failed`,
    },
    {
        name: "espresso",
        file: "docker-compose-espresso.yaml",
        healthySemaphore: "proxy",
        healthyTitle: (port) =>
            `Service ${chalk.cyan("espresso")} ready at ${chalk.cyan(`${host}:${port}/espresso`)}`,
        waitTitle: `Starting ${chalk.cyan("espresso")}...`,
        errorTitle: `Service ${chalk.red("espresso")} failed`,
    },
    {
        name: "explorer",
        file: "docker-compose-explorer.yaml",
        healthySemaphore: "proxy",
        healthyTitle: (port) =>
            `Service ${chalk.cyan("explorer")} ready at ${chalk.cyan(`${host}:${port}/explorer`)}`,
        waitTitle: `Starting ${chalk.cyan("explorer")}...`,
        errorTitle: `Service ${chalk.red("explorer")} failed`,
    },
    {
        name: "graphql",
        file: "docker-compose-graphql.yaml",
        healthySemaphore: "proxy",
        healthyTitle: (port) =>
            `Service ${chalk.cyan("graphql")} ready at ${chalk.cyan(`${host}:${port}/graphql`)}`,
        waitTitle: `Starting ${chalk.cyan("graphql")}...`,
        errorTitle: `Service ${chalk.red("graphql")} failed`,
    },
    {
        name: "paymaster",
        file: "docker-compose-paymaster.yaml",
        healthySemaphore: "proxy",
        healthyTitle: (port) =>
            `Service ${chalk.cyan("paymaster")} ready at ${chalk.cyan(`${host}:${port}/paymaster`)}`,
        waitTitle: `Starting ${chalk.cyan("paymaster")}...`,
        errorTitle: `Service ${chalk.red("paymaster")} failed`,
    },
];

const serviceMonitorTask = (options: {
    errorTitle?: string;
    healthyTitle?: string;
    projectName: string;
    service: string;
    waitTitle?: string;
}): ListrTask => {
    const { errorTitle, healthyTitle, service, waitTitle } = options;

    return {
        task: async (_ctx, task) => {
            await pRetry(
                async () => {
                    const health = await getServiceHealth(options);
                    if (health !== "healthy") {
                        throw new Error(
                            errorTitle ??
                                `Service ${chalk.cyan(service)} is not healthy`,
                        );
                    }
                },
                { retries: 100, minTimeout: 500, factor: 1.1 },
            );
            task.title =
                healthyTitle ?? `Service ${chalk.cyan(service)} is ready`;
        },
        title: waitTitle ?? `Starting ${chalk.cyan(service)}...`,
    };
};

export const createStartCommand = () => {
    return new Command<[], {}, RollupsCommandOpts>("start")
        .description("Start a local rollups node environment.")
        .configureHelp({ showGlobalOptions: true })
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
            "--services <string>",
            `optional services to start, comma separated list from [${availableServices.map(({ name }) => name).join(", ")}]`,
            commaSeparatedList,
            [],
        )
        .option("-p, --port <number>", "port to listen on", parseInt, 8080)
        .option("--dry-run", "show the docker compose configuration", false)
        .option("-v, --verbose", "verbose output", false)
        .action(async (options, command) => {
            const { projectName } = command.optsWithGlobals();
            const {
                blockTime,
                cpus,
                defaultBlock,
                dryRun,
                memory,
                port,
                services,
                verbose,
            } = options;
            // path of the tool instalation
            const binPath = path.join(
                path.dirname(new URL(import.meta.url).pathname),
                "../..",
            );

            // setup the environment variable used in docker compose
            const env: NodeJS.ProcessEnv = {
                BLOCK_TIME: blockTime.toString(),
                CARTESI_BLOCKCHAIN_DEFAULT_BLOCK: defaultBlock,
                CARTESI_LOG_LEVEL: verbose ? "debug" : "info",
                CARTESI_BIN_PATH: binPath,
                CARTESI_LISTEN_PORT: port.toString(),
                CARTESI_ROLLUPS_NODE_CPUS: cpus?.toString(),
                CARTESI_ROLLUPS_NODE_MEMORY: memory?.toString(),
                CARTESI_SDK_IMAGE: DEFAULT_SDK,
            };

            // build a list of unique compose files
            const composeFiles = [
                ...new Set(baseServices.map(({ file }) => file)),
            ];

            // cpu and memory limits, mostly for testing and debuggingpurposes
            if (cpus) {
                composeFiles.push("docker-compose-node-cpus.yaml");
            }
            if (memory) {
                composeFiles.push("docker-compose-node-memory.yaml");
            }

            // select subset of optional services
            const optionalServices =
                services.length === 1 && services[0] === "all"
                    ? availableServices
                    : availableServices.filter(({ name }) =>
                          services.includes(name),
                      );

            // add to compose files list
            composeFiles.push(...optionalServices.map(({ file }) => file));

            // create the "--file <file>" list
            const files = composeFiles
                .map((f) => [
                    "--file",
                    path.join(binPath, "compose", "rollups", f),
                ])
                .flat();

            const composeArgs = [
                "compose",
                ...files,
                "--project-name",
                projectName,
            ];

            // run in detached mode (background)
            const upArgs = ["--detach"];

            if (dryRun) {
                // show the docker compose configuration
                await execa("docker", [...composeArgs, "config"], {
                    env,
                    stdio: "inherit",
                });
            } else {
                // pull images first
                await execa("docker", [...composeArgs, "pull"], {
                    env,
                    stdio: "inherit",
                });

                // run compose environment
                const up = execa("docker", [...composeArgs, "up", ...upArgs], {
                    env,
                });

                // create tasks to monitor services startup
                const monitorTasks = [...baseServices, ...optionalServices]
                    .filter(({ healthySemaphore }) => !!healthySemaphore) // only services with a healthy semaphore
                    .map((service) => {
                        const healthyTitle =
                            typeof service.healthyTitle === "function"
                                ? service.healthyTitle(port)
                                : service.healthyTitle;
                        return serviceMonitorTask({
                            projectName,
                            service: service.healthySemaphore!,
                            errorTitle: service.errorTitle,
                            waitTitle: service.waitTitle,
                            healthyTitle,
                        });
                    });

                const tasks = new Listr(monitorTasks, { concurrent: true });
                await tasks.run();
                await up;
            }
        });
};
