import { Command, Option } from "@commander-js/extra-typings";
import { execa } from "execa";
import fs from "fs-extra";
import path from "path";
import { getMachineHash } from "../base.js";

export const registerRunCommand = (program: Command) => {
    program
        .command("run")
        .description("Run a local cartesi node for the application.")
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
                "--epoch-length <number>",
                "length of an epoch (in blocks)",
            )
                .argParser(Number)
                .default(720),
        )
        .option(
            "--disable-explorer",
            "disable local explorer service to save machine resources",
            false,
        )
        .option(
            "--disable-bundler",
            "disable local bundler service to save machine resources",
            false,
        )
        .option(
            "--disable-paymaster",
            "disable local paymaster service to save machine resources",
            false,
        )
        .option("--enable-espresso", "enable espresso development node", false)
        .option(
            "--disable-graphql",
            "disable local graphql service to save machine resources",
            false,
        )
        .option(
            "--no-backend",
            "run a node without the application code",
            false,
        )
        .option("-v, --verbose", "verbose output", false)
        .addOption(
            new Option(
                "--port <number>",
                "port to listen for incoming connections",
            )
                .argParser(Number)
                .default(8080),
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
        .option("--dry-run", "show the docker compose configuration", false)
        .action(
            async ({
                blockTime,
                epochLength,
                disableExplorer,
                disableBundler,
                disablePaymaster,
                enableEspresso,
                disableGraphql,
                backend,
                verbose,
                port,
                dryRun,
                cpus,
                memory,
            }) => {
                let projectName: string;

                if (backend) {
                    projectName = "cartesi-node";
                } else {
                    // get machine hash
                    const hash = getMachineHash();
                    // Check if snapshot exists
                    if (!hash) {
                        throw new Error(
                            `Cartesi machine snapshot not found, run 'build'`,
                        );
                    }
                    projectName = hash.substring(2, 10);
                }

                // path of the tool instalation
                const binPath = path.join(
                    path.dirname(new URL(import.meta.url).pathname),
                    "..",
                );

                // setup the environment variable used in docker compose
                const blockInterval = blockTime;
                const listenPort = port;
                const env: NodeJS.ProcessEnv = {
                    ANVIL_VERBOSITY: verbose ? "--steps-tracing" : "--silent",
                    BLOCK_TIME: blockInterval.toString(),
                    BLOCK_TIMEOUT: (blockInterval + 3).toString(),
                    CARTESI_EPOCH_LENGTH: epochLength.toString(),
                    CARTESI_EXPERIMENTAL_DISABLE_CONFIG_LOG: verbose
                        ? "false"
                        : "true",
                    CARTESI_EXPERIMENTAL_SERVER_MANAGER_BYPASS_LOG: verbose
                        ? "false"
                        : "true",
                    CARTESI_LOG_LEVEL: verbose ? "info" : "error",
                    CARTESI_SNAPSHOT_DIR: "/usr/share/rollups-node/snapshot",
                    CARTESI_BIN_PATH: binPath,
                    CARTESI_LISTEN_PORT: listenPort.toString(),
                    CARTESI_VALIDATOR_CPUS: cpus?.toString(),
                    CARTESI_VALIDATOR_MEMORY: memory?.toString(),
                };

                // validator
                const composeFiles = ["docker-compose-validator.yaml"];
                if (cpus) {
                    composeFiles.push("docker-compose-validator-cpus.yaml");
                }
                if (memory) {
                    composeFiles.push("docker-compose-validator-memory.yaml");
                }

                // prompt
                composeFiles.push("docker-compose-prompt.yaml");

                // database
                composeFiles.push("docker-compose-database.yaml");

                // proxy
                composeFiles.push("docker-compose-proxy.yaml");

                // anvil
                composeFiles.push("docker-compose-anvil.yaml");

                // explorer
                if (!disableExplorer) {
                    composeFiles.push("docker-compose-explorer.yaml");
                }

                // account abstraction
                if (!disableBundler) {
                    composeFiles.push("docker-compose-bundler.yaml");
                }
                if (!disablePaymaster && !disableBundler) {
                    // only add paymaster if bundler is enabled
                    composeFiles.push("docker-compose-paymaster.yaml");
                }

                // espresso development node
                if (enableEspresso) {
                    composeFiles.push("docker-compose-espresso.yaml");
                }

                // graphql
                if (!disableGraphql) {
                    composeFiles.push("docker-compose-graphql.yaml");
                }

                // load the no-backend compose file
                if (backend) {
                    composeFiles.push("docker-compose-host.yaml");
                } else {
                    // snapshot volume
                    composeFiles.push("docker-compose-snapshot-volume.yaml");
                }

                // add project env file loading
                if (fs.existsSync("./.cartesi.env")) {
                    composeFiles.push("docker-compose-envfile.yaml");
                }

                // create the "--file <file>" list
                const files = composeFiles
                    .map((f) => ["--file", path.join(binPath, "node", f)])
                    .flat();

                const compose_args = [
                    "compose",
                    ...files,
                    "--project-directory",
                    ".",
                    "--project-name",
                    projectName,
                ];

                const up_args = [];

                if (!verbose) {
                    compose_args.push("--progress", "quiet");
                    up_args.push("--attach", "validator");
                    up_args.push("--attach", "prompt");
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
            },
        );
};
