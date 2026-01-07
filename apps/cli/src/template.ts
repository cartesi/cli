import { ensureDir } from "fs-extra";
import { unpackTar } from "modern-tar/fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

export interface DownloadTemplateResult {
    dir: string;
    source: string;
}

export const download = async (
    template: string,
    branch: string,
    out: string,
): Promise<DownloadTemplateResult> => {
    const repoUrl = "https://github.com/cartesi/application-templates";
    const tarballUrl = `https://codeload.github.com/cartesi/application-templates/tar.gz/refs/heads/${branch}`;

    // Ensure output directory exists
    await ensureDir(out);

    // Download the tarball
    const response = await fetch(tarballUrl);
    if (!response.ok) {
        throw new Error(`Failed to download template: ${response.statusText}`);
    }

    // Stream download → gunzip → extract with filtering
    // GitHub tarball structure: application-templates-{branch}/{template}/...
    // We need to extract only files within the template subdirectory
    const extractStream = unpackTar(out, {
        filter: (header) => {
            // remove first path segment
            const pathname = header.name.split("/").splice(1).join("/");
            return pathname.startsWith(template);
        },
        map: (header) => {
            // remove first path segment
            const pathname = header.name.split("/").splice(1).join("/");
            header.name = path.relative(template, pathname);
            return header;
        },
    });

    await pipeline(
        response.body as ReadableStream,
        createGunzip(),
        extractStream,
    );

    return {
        dir: out,
        source: repoUrl,
    };
};
