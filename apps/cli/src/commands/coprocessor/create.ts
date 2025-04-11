import { Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import ora from "ora";
import path from "path";
import { download } from "../../template.js";

export const DEFAULT_TEMPLATES_BRANCH = "prerelease/sdk-12";

const TEMPLATES = [
    "cpp",
    "cpp-low-level",
    "go",
    "javascript",
    "lua",
    "python",
    "ruby",
    "rust",
    "typescript",
] as const;

const subDirs = ["coprocessor_program", "contracts"];
let route: string;

export const createCreateCommand = () => {
    return new Command("create")
        .argument("<name>", "application and directory name")
        .description("Create a coprocessor application template.")
        .addOption(
            new Option("-t, --template <template>", "template name to use")
                .choices(TEMPLATES)
                .makeOptionMandatory(),
        )
        .option(
            "-b, --branch <branch>",
            "cartesi/application-templates repository branch name to use",
            DEFAULT_TEMPLATES_BRANCH,
        )
        .action(async (name, { branch, template }) => {
            const spinner = ora("Creating application...").start();
            try {
                for (const subdir of subDirs) {
                    if (subdir === "coprocessor_program") {
                        const { dir } = await download(
                            "coprocessor",
                            template,
                            branch,
                            `${name}/${subdir}`,
                        );
                        route = dir;
                    } else {
                        const { dir } = await download(
                            "coprocessor",
                            "solidity",
                            branch,
                            `${name}/${subdir}`,
                        );
                    }
                }
                spinner.succeed(
                    `Application created at ${chalk.cyan(path.dirname(route))}`,
                );
            } catch (e: unknown) {
                spinner.fail(
                    e instanceof Error
                        ? `Error creating application: ${chalk.red(e.message)}`
                        : String(e),
                );
            }
        });
};
