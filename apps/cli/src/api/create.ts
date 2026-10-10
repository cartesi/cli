import { download, type DownloadTemplateResult } from "../template.js";

/** Templates available at the `cartesi/application-templates` repository. */
export const TEMPLATES = [
    "cpp",
    "cpp-low-level",
    "go",
    "java",
    "javascript",
    "lua",
    "python",
    "ruby",
    "rust",
    "typescript",
] as const;

export type Template = (typeof TEMPLATES)[number];

/** Default branch of the `cartesi/application-templates` repository. */
export const DEFAULT_TEMPLATES_BRANCH = "prerelease/sdk-12";

export type CreateOptions = {
    /** Application name, also used as the directory the application is created at. */
    name: string;

    /** Name of the template to use, one of {@link TEMPLATES}. */
    template: string;

    /**
     * Branch of the `cartesi/application-templates` repository to use.
     * @default DEFAULT_TEMPLATES_BRANCH
     */
    branch?: string;
};

/**
 * Create an application from a template of the `cartesi/application-templates`
 * repository.
 * @param options create options
 * @returns directory the application was created at, and its source repository
 */
export const create = async (
    options: CreateOptions,
): Promise<DownloadTemplateResult> => {
    const { branch = DEFAULT_TEMPLATES_BRANCH, name, template } = options;
    return download(template, branch, name);
};

export type { DownloadTemplateResult };
