import { Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import ora from "ora";
import { download } from "../template.js";

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
    "java"
] as const;

export const createCreateCommand = () => {
    return new Command("create")
        .argument("<name>", "application and directory name")
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
                const { dir } = await download(template, branch, name);
                spinner.succeed(`Application created at ${chalk.cyan(dir)}`);
            } catch (e: unknown) {
                spinner.fail(
                    e instanceof Error
                        ? `Error creating application: ${chalk.red(e.message)}`
                        : String(e),
                );
            }
        });
};
