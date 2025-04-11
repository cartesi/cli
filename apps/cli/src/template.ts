import type { TemplateProvider } from "giget";
import { DownloadTemplateResult, downloadTemplate } from "giget";

export const download = async (
    framework: string,
    template: string,
    branch: string,
    out: string,
): Promise<DownloadTemplateResult> => {
    const cartesiProvider: TemplateProvider = async (input) => {
        return {
            name: "cartesi",
            subdir: `${framework}/${input}`,
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

export const DEFAULT_TEMPLATES_BRANCH = "prerelease/sdk-12";

export const TEMPLATES = [
    "cpp",
    "cpp-low-level",
    "go",
    "javascript",
    "lua",
    "python",
    "ruby",
    "rust",
    "typescript",
];
