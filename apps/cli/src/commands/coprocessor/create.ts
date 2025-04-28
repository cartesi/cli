import { Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import ora from "ora";
import path from "path";
import {
    DEFAULT_TEMPLATES_BRANCH,
    download,
    TEMPLATES,
} from "../../template.js";

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
                let { dir } = await download(
                    "coprocessor",
                    template,
                    branch,
                    path.join(name, "app"),
                );

                await download(
                    "coprocessor",
                    "solidity",
                    branch,
                    path.join(name, "contracts"),
                );

                spinner.succeed(
                    `Application created at ${chalk.cyan(path.dirname(dir))}`,
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
