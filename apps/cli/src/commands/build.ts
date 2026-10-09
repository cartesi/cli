import { Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import fs from "fs-extra";
import { Listr, type ListrTask } from "listr2";
import path from "node:path";
import tmp from "tmp";
import { getApplicationConfig, getContextPath } from "../base.js";
import {
    buildDirectory,
    buildDocker,
    buildEmpty,
    buildNone,
    buildNvram,
    buildTar,
} from "../builder/index.js";
import {
    type Config,
    type DriveConfig,
    getAccountsDrive,
    type ImageInfo,
    LOG2_LEAF_SIZE,
    type NvramConfig,
} from "../config.js";
import { bootMachine } from "../machine.js";
import {
    type AccountsDriveLayout,
    DEVNET_GUARDIAN,
    DEVNET_WITHDRAWAL_OUTPUT_BUILDER,
    readStoredMachineConfig,
    resolveAccountsDriveLayout,
    resolveWithdrawalConfig,
} from "../withdrawal.js";

// context for Listr build tasks
interface BuildContext {
    config: Config;
    debug: boolean;
    destination: string;
    imageInfo?: ImageInfo;
}

const buildDriveTask = (
    name: string,
    drive: DriveConfig,
): ListrTask<BuildContext> => ({
    title: `Building drive ${chalk.cyan(name)}`,
    task: async (ctx, task) => {
        const { config, debug, destination } = ctx;
        const sdk = config.sdk;
        const reporter = (line: string) => {
            task.output = line;
        };

        switch (drive.builder) {
            case "directory": {
                await buildDirectory(
                    name,
                    drive,
                    sdk,
                    destination,
                    debug,
                    reporter,
                );
                break;
            }
            case "docker": {
                const imageInfo = await buildDocker(
                    name,
                    drive,
                    sdk,
                    destination,
                    debug,
                    reporter,
                );
                if (imageInfo && name === "root") {
                    // only set image info for root drive
                    ctx.imageInfo = imageInfo;
                }
                break;
            }
            case "empty": {
                await buildEmpty(name, drive, sdk, destination);
                break;
            }
            case "tar": {
                await buildTar(name, drive, sdk, destination, reporter);
                break;
            }
            case "none": {
                await buildNone(name, drive, destination);
                break;
            }
        }
        task.title = `Build drive ${chalk.cyan(name)}`;
    },
});

const buildNvramTask = (
    label: string,
    nvram: NvramConfig,
): ListrTask<BuildContext> => ({
    title: `Building nvram ${chalk.cyan(label)}`,
    task: async (ctx, task) => {
        await buildNvram(label, nvram, ctx.destination);
        task.title = `Build nvram ${chalk.cyan(label)}`;
    },
});

// formats a length in the largest unit that divides it, e.g. 384 MiB
const formatBytes = (length: bigint): string => {
    const units = ["bytes", "KiB", "MiB", "GiB", "TiB"];
    let unit = 0;
    while (
        unit < units.length - 1 &&
        length >= 1024n ** BigInt(unit + 1) &&
        length % 1024n ** BigInt(unit + 1) === 0n
    ) {
        unit++;
    }
    return `${length / 1024n ** BigInt(unit)} ${units[unit]}`;
};

const printRows = (rows: [string, string][], indent = "") => {
    const width = Math.max(...rows.map(([key]) => key.length));
    for (const [key, value] of rows) {
        console.log(`${indent}${key.padEnd(width)}  ${value}`);
    }
};

/**
 * Prints the accounts drive, so the developer knows which device to open and how its accounts
 * are laid out, and the emergency withdrawal configuration as the application contract takes it,
 * so it can be used to deploy the application elsewhere.
 */
const printAccountsDrive = (config: Config, layout: AccountsDriveLayout) => {
    const withdrawal = resolveWithdrawalConfig(config, layout);
    const accountSize =
        2 ** (LOG2_LEAF_SIZE + withdrawal.log2_leaves_per_account);
    const accounts = 1n << BigInt(withdrawal.log2_max_num_of_accounts);

    // devnet defaults don't exist on other chains
    const devnetOnly =
        withdrawal.guardian === DEVNET_GUARDIAN ||
        withdrawal.withdrawal_output_builder ===
            DEVNET_WITHDRAWAL_OUTPUT_BUILDER;
    const address = (value: string, devnetValue: string, name: string) =>
        value === devnetValue ? `${value} ${chalk.yellow(`(${name})`)}` : value;

    printRows([
        [
            "accounts drive",
            `${layout.kind === "nvram" ? "nvram" : "drive"} ${chalk.cyan(layout.label)} → ${chalk.cyan(layout.device)}`,
        ],
        [
            "size",
            layout.length === layout.driveLength
                ? `${formatBytes(layout.length)} (2^${layout.log2Length} bytes)`
                : `${formatBytes(layout.length)} (2^${layout.log2Length} bytes), at the beginning of ${formatBytes(layout.driveLength)}`,
        ],
        ["accounts", `${accounts} × ${accountSize} bytes`],
    ]);

    // field names and order of the WithdrawalConfig struct of the application contract
    console.log();
    console.log("withdrawal config");
    printRows(
        [
            [
                "guardian",
                address(
                    withdrawal.guardian,
                    DEVNET_GUARDIAN,
                    "devnet account 0",
                ),
            ],
            [
                "log2LeavesPerAccount",
                withdrawal.log2_leaves_per_account.toString(),
            ],
            [
                "log2MaxNumOfAccounts",
                withdrawal.log2_max_num_of_accounts.toString(),
            ],
            [
                "accountsDriveStartIndex",
                withdrawal.accounts_drive_start_index.toString(),
            ],
            [
                "withdrawalOutputBuilder",
                address(
                    withdrawal.withdrawal_output_builder,
                    DEVNET_WITHDRAWAL_OUTPUT_BUILDER,
                    "devnet TestUsdWithdrawalOutputBuilder",
                ),
            ],
        ],
        "  ",
    );

    // same JSON cartesi run passes on to the node
    console.log();
    console.log(
        `cartesi-rollups-cli deploy application ... --withdrawal-config '${JSON.stringify(withdrawal)}'`,
    );
    if (devnetOnly) {
        console.log(
            chalk.dim(
                "to deploy elsewhere, set guardian and withdrawal_output_builder under [withdrawal] in a separate file and build with it, e.g. cartesi build -c testnet.toml",
            ),
        );
    }
};

export const createBuildCommand = () => {
    return new Command("build")
        .description(
            "Build application by building Cartesi machine drives, configuring a machine and booting it.",
        )
        .option(
            "-c, --config <config>",
            "path to the configuration file",
            (value, prev) => prev.concat([value]),
            ["cartesi.toml"],
        )
        .addOption(
            new Option(
                "--debug",
                "enable debug mode (do not remove intermediate files)",
            )
                .default(false)
                .hideHelp(),
        )
        .option("-d, --drives-only", "only build drives, do not boot machine")
        .option("-v, --verbose", "verbose output", false)
        .action(async (options) => {
            const { debug, drivesOnly, verbose } = options;

            // clean up temp files we create along the process
            tmp.setGracefulCleanup();

            // get application configuration from 'cartesi.toml'
            const config = getApplicationConfig(options.config);

            // destination directory for image and intermediate files
            const destination = path.resolve(getContextPath());

            // prepare context directory
            await fs.emptyDir(destination); // XXX: make it less error prone

            // build context
            const ctx = {
                config,
                debug,
                destination,
                verbose,
                imageInfo: undefined,
            };

            // tasks to build drives
            const driveTasks = Object.entries(config.drives).map(
                ([name, drive]) => buildDriveTask(name, drive),
            );

            // tasks to build the images backing nvrams, pristine ones need none
            const nvramTasks = Object.entries(config.nvrams).map(
                ([label, nvram]) => buildNvramTask(label, nvram),
            );

            const groups: ListrTask<BuildContext>[] = [
                {
                    title: "Build drives",
                    task: async (_ctx, task) => {
                        return task.newListr(driveTasks, {
                            concurrent: true,
                            rendererOptions: {
                                collapseSubtasks: false,
                            },
                            ctx,
                        });
                    },
                },
            ];

            if (nvramTasks.length > 0) {
                groups.push({
                    title: "Build nvrams",
                    task: async (_ctx, task) => {
                        return task.newListr(nvramTasks, {
                            concurrent: true,
                            rendererOptions: {
                                collapseSubtasks: false,
                            },
                            ctx,
                        });
                    },
                });
            }

            const builds = new Listr(groups, {
                ctx,
                renderer: verbose ? "verbose" : "default",
            });
            const result = await builds.run();

            // if only build drives, quit here
            if (drivesOnly) {
                return;
            }

            // create machine snapshot
            await bootMachine(
                config,
                result.imageInfo,
                {
                    finalHash: true,
                    store: "image",
                },
                {
                    cwd: destination,
                    stdio: "inherit",
                },
            );

            // make snapshot readable by all users, because cartesi-machine sets to 600
            const imagePath = path.join(destination, "image");
            await fs.chmod(imagePath, 0o755);

            // check the accounts drive where cartesi-machine placed it
            if (getAccountsDrive(config)) {
                const layout = resolveAccountsDriveLayout(
                    config,
                    readStoredMachineConfig(imagePath),
                );
                if (layout) {
                    printAccountsDrive(config, layout);
                }
            }
        });
};
