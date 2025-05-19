import type { TemplateProvider } from "giget";
import { type DownloadTemplateResult, downloadTemplate } from "giget";

export const download = async (
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
