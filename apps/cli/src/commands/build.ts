import { Command, Option } from "@commander-js/extra-typings";
import { type BuildResult, build } from "../api/build.js";
import { describeWithdrawalConfig } from "../withdrawal.js";

/**
 * Print what a build has to show after its progress: the accounts drive
 * layout, and what will be deployed from it. Shared by `cartesi build` and the
 * "Build and redeploy" of `cartesi run`.
 */
export const printBuildResult = (result: BuildResult) => {
    if (result.withdrawal) {
        const { layout, withdrawal } = result.withdrawal;
        console.log();
        console.log(
            describeWithdrawalConfig(result.config, layout, withdrawal),
        );
    }
};

export const createBuildCommand = () => {
    return new Command("build")
        .description(
            "Build application by building Cartesi machine drives, configuring a machine and booting it.",
        )
        .addOption(
            new Option(
                "-c, --config <config>",
                "path to the configuration file",
            )
                .argParser<string[]>((value, prev) => prev.concat([value]))
                .default(
                    [] as string[],
                    "the configuration file of the project",
                ),
        )
        .addOption(
            new Option(
                "--debug",
                "enable debug mode (do not remove intermediate files)",
            )
                .default(false)
                .hideHelp(),
        )
        .option(
            "--cache-from <spec>",
            "cache source for docker buildx build (can be repeated)",
            (value: string, prev: string[]) => prev.concat([value]),
            [] as string[],
        )
        .option(
            "--cache-to <spec>",
            "cache destination for docker buildx build (can be repeated)",
            (value: string, prev: string[]) => prev.concat([value]),
            [] as string[],
        )
        .option("-d, --drives-only", "only build drives, do not boot machine")
        .option("-v, --verbose", "verbose output", false)
        .action(async (options) => {
            const { cacheFrom, cacheTo, config, debug, drivesOnly, verbose } =
                options;

            const result = await build({
                cacheFrom,
                cacheTo,
                config,
                debug,
                drivesOnly,
                progress: verbose ? "verbose" : "default",
            });
            printBuildResult(result);
        });
};
