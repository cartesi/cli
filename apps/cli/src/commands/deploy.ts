import { Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import ora from "ora";
import { encodeFunctionData, zeroHash } from "viem";
import { getMachineHash, parseAddress, parseHash } from "../base.js";
import { DEFAULT_COMPOSE_ENVIRONMENT_NAME } from "../config.js";
import { dataAvailabilityAbi, inputBoxAddress } from "../contracts.js";
import { deployApplication } from "../exec/rollups.js";

const parseDataAvailability = (
    type: "input-box" | "espresso",
    espressoBlock: number,
    espressoNamespace: number,
) => {
    if (type === "espresso") {
        return encodeFunctionData({
            abi: dataAvailabilityAbi,
            functionName: "InputBoxAndEspresso",
            args: [inputBoxAddress, BigInt(espressoBlock), espressoNamespace],
        });
    }
    return encodeFunctionData({
        abi: dataAvailabilityAbi,
        functionName: "InputBox",
        args: [inputBoxAddress],
    });
};

export const createDeployCommand = () => {
    return new Command("deploy")
        .description("Deploy a rollups application to a rollups node.")
        .configureHelp({ showGlobalOptions: true })
        .option(
            "--environment-name <string>",
            "name of environment",
            DEFAULT_COMPOSE_ENVIRONMENT_NAME,
        )
        .option("--chain-id <id>", "Chain ID", Number.parseInt, 13370)
        .option("--rpc-url <url>", "RPC URL")
        .option("--mnemonic <phrase>", "Mnemonic passphrase")
        .option(
            "--mnemonic-index <index>",
            "Mnemonic account index",
            Number.parseInt,
            0,
        )
        .option("--name <string>", "application name")
        .option(
            "--authority-owner <address>",
            "authority owner",
            parseAddress,
            undefined,
        )
        .option(
            "--application-owner <address>",
            "application owner",
            parseAddress,
            undefined,
        )
        .addOption(
            new Option(
                "--epoch-length <number>",
                "length of an epoch (in blocks)",
            )
                .argParser(Number)
                .default(720),
        )
        .option("--salt <hash>", "salt for deployment", parseHash, zeroHash)
        .option("--json", "output in JSON format")
        .addOption(
            new Option(
                "--data-availability <type>",
                "Data availability layer to use (input-box or espresso)",
            )
                .choices(["input-box", "espresso"])
                .default("input-box"),
        )
        .addOption(
            new Option("--espresso-block <number>", "espresso starting block")
                .argParser(Number)
                .default(1),
        )
        .addOption(
            new Option("--espresso-namespace <number>", "espresso namespace Id")
                .argParser(Number)
                .default(1),
        )
        .action(async (options, command) => {
            const {
                json,
                epochLength,
                dataAvailability: daType,
                environmentName,
                espressoBlock,
                espressoNamespace,
            } = options;

            // If inputbox is chosen, warn if espresso args are provided
            if (
                daType === "input-box" &&
                (espressoBlock !== undefined || espressoNamespace !== undefined)
            ) {
                console.warn(
                    chalk.yellow(
                        "WARNING: --espresso-block and --espresso-namespace-id are ignored when --data-availability is input-box",
                    ),
                );
            }

            const progress = ora();

            // get cartesi machine snapshot hash, produced by 'build'
            const templateHash = getMachineHash();
            if (!templateHash) {
                progress.fail(
                    `Cartesi machine snapshot not found, run 'build'`,
                );
                return;
            }

            try {
                // parse dataAvailability
                const dataAvailability = parseDataAvailability(
                    daType,
                    espressoBlock,
                    espressoNamespace,
                );

                // use template hash as app name
                const name = templateHash;
                progress.start(`deploying ${chalk.cyan(name)}`);
                const address = await deployApplication({
                    epochLength,
                    name,
                    projectName: environmentName,
                    snapshotPath:
                        "/var/lib/cartesi-rollups-node/snapshots/image",
                });
                progress.succeed(
                    `${chalk.cyan(name)} deployed at ${chalk.cyan(address)}`,
                );
            } catch (e: unknown) {
                progress.fail(e instanceof Error ? e.message : "Unknown error");
            }
        });
};
