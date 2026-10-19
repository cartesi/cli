import { Command, Option } from "@commander-js/extra-typings";
import { build } from "../api/build.js";
import { describeWithdrawalConfig } from "../withdrawal.js";

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
            const { config, debug, drivesOnly, verbose } = options;

            const result = await build({
                config,
                debug,
                drivesOnly,
                progress: verbose ? "verbose" : "default",
            });

            // show the accounts drive layout, and what will be deployed from it
            if (result.withdrawal) {
                const { layout, withdrawal } = result.withdrawal;
                console.log();
                console.log(
                    describeWithdrawalConfig(result.config, layout, withdrawal),
                );
            }
        });
};
