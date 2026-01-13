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

    // Download the tarball
    const response = await fetch(tarballUrl);
    if (!response.ok) {
        throw new Error(`Failed to download template: ${response.statusText}`);
    }

    // Create archive from downloaded tarball
    // GitHub tarball structure: application-templates-{branch}/{template}/...
    const archive = new Bun.Archive(await response.blob());

    // Get all files matching the template subdirectory pattern
    // The glob pattern matches: application-templates-{branch}/{template}/**
    const pattern = `*/${template}/**`;
    const files = await archive.files(pattern);

    // Write extracted files, stripping the prefix from paths
    for (const [archivePath, file] of files) {
        // Remove "application-templates-{branch}/{template}/" prefix
        const segments = archivePath.split("/");
        const relativePath = segments.slice(2).join("/");
        
        if (relativePath) {
            const targetPath = `${out}/${relativePath}`;
            await Bun.write(targetPath, file);
        }
    }

    return {
        dir: out,
        source: repoUrl,
    };
};
