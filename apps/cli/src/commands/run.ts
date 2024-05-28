import { Flags } from "@oclif/core";
import { execa } from "execa";
import fs from "fs-extra";
import path from "path";

import { BaseCommand } from "../baseCommand.js";

export default class Run extends BaseCommand<typeof Run> {
    static summary = "Run application node.";

    static description = "Run a local cartesi node for the application.";

    static examples = ["<%= config.bin %> <%= command.id %>"];

    static flags = {
        "block-time": Flags.integer({
            description: "interval between blocks (in seconds)",
            default: 5,
        }),
        "disable-explorer": Flags.boolean({
            default: false,
            description:
                "disable local explorer service to save machine resources",
            summary: "disable explorer service",
        }),
        "disable-bundler": Flags.boolean({
            default: false,
            description:
                "disable local bundler service to save machine resources",
            summary: "disable bundler service",
        }),
        "disable-paymaster": Flags.boolean({
            default: false,
            description:
                "disable local paymaster service to save machine resources",
            summary: "disable paymaster service",
        }),
        "epoch-length": Flags.integer({
            description: "length of an epoch (in blocks)",
            default: 720,
        }),
        "no-backend": Flags.boolean({
            description:
                "Run a node without the application code. Application must be executed by the developer on the host machine, fetching inputs from the node running at http://localhost:5004",
            summary: "run a node without the application code",
            default: false,
        }),
        verbose: Flags.boolean({
            description: "verbose output",
            default: false,
            char: "v",
        }),
        "listen-port": Flags.integer({
            description: "port to listen for incoming connections",
            default: 8080,
        }),
        cpus: Flags.integer({
            description:
                "Define the number of CPUs to use (eg.: 1) for the rollups-node",
            summary: "number of cpu limits for the rollups-node",
        }),
        memory: Flags.integer({
            description:
                "Define the amount of memory to use for the rollups-node in MB (eg.: 1024)",
            summary: "memory limit for the rollups-node in MB",
        }),
        "dry-run": Flags.boolean({
            description: "show the docker compose configuration",
            default: false,
            hidden: true,
        }),
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(Run);

        // path of the tool instalation
        const binPath = path.join(
            path.dirname(new URL(import.meta.url).pathname),
            "..",
        );

        // setup the environment variable used in docker compose
        const blockInterval = flags["block-time"];
        const epochLength = flags["epoch-length"];
        const listenPort = flags["listen-port"];
        const env: NodeJS.ProcessEnv = {
            ANVIL_VERBOSITY: flags.verbose ? "--steps-tracing" : "--silent",
            BLOCK_TIME: blockInterval.toString(),
            BLOCK_TIMEOUT: (blockInterval + 3).toString(),
            CARTESI_EPOCH_LENGTH: epochLength.toString(),
            CARTESI_EXPERIMENTAL_DISABLE_CONFIG_LOG: flags.verbose
                ? "false"
                : "true",
            CARTESI_EXPERIMENTAL_SERVER_MANAGER_BYPASS_LOG: flags.verbose
                ? "false"
                : "true",
            CARTESI_LOG_LEVEL: flags.verbose ? "info" : "error",
            CARTESI_SNAPSHOT_DIR: "/usr/share/rollups-node/snapshot",
            CARTESI_BIN_PATH: binPath,
            CARTESI_LISTEN_PORT: listenPort.toString(),
            CARTESI_VALIDATOR_CPUS: flags.cpus?.toString(),
            CARTESI_VALIDATOR_MEMORY: flags.memory?.toString(),
        };

        // cartesi project name
        const composeFiles = ["docker-compose-cartesi.yaml"];

        // validator
        composeFiles.push("docker-compose-validator.yaml");

        // limit cpu
        if (flags.cpus) {
            composeFiles.push("docker-compose-validator-cpus.yaml");
        }

        // limit memory
        if (flags.memory) {
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
        if (!flags["disable-explorer"]) {
            composeFiles.push("docker-compose-explorer.yaml");
        }

        // account abstraction
        if (!flags["disable-bundler"]) {
            composeFiles.push("docker-compose-bundler.yaml");
        }
        if (!flags["disable-paymaster"] && !flags["disable-bundler"]) {
            // only add paymaster if bundler is enabled
            composeFiles.push("docker-compose-paymaster.yaml");
        }

        // load the no-backend compose file
        if (flags["no-backend"]) {
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

        const compose_args = ["compose", ...files, "--project-directory", "."];

        const up_args = [];

        if (!flags.verbose) {
            compose_args.push("--progress", "quiet");
            up_args.push("--attach", "validator");
            up_args.push("--attach", "prompt");
        }

        // XXX: need this handler, so SIGINT can still call the finally block below
        process.on("SIGINT", () => {});

        try {
            if (flags["dry-run"]) {
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
            await execa("docker", [...compose_args, "down", "--volumes"], {
                env,
                stdio: "inherit",
            });
        }
    }
}
