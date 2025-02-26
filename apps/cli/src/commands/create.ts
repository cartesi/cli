import { Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import type { TemplateProvider } from "giget";
import { DownloadTemplateResult, downloadTemplate } from "giget";
import ora from "ora";

export const DEFAULT_TEMPLATES_BRANCH = "sdk-0.9";

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

const download = async (
    template: string,
    branch: string,
    out: string,
): Promise<DownloadTemplateResult> => {
    const cartesiProvider: TemplateProvider = async (input) => {
        return {
            name: "cartesi",
            subdir: input,
            url: "https://github.com/cartesi/application-templates",
            tar: `https://codeload.github.com/cartesi/application-templates/tar.gz/refs/heads/${branch}`,
        };
    };

    const input = `cartesi:${template}`;
    return downloadTemplate(input, {
        dir: out,
        providers: { cartesi: cartesiProvider },
    });
};

export const registerCreateCommand = (program: Command) => {
    program
        .command("create")
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
