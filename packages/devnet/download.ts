import { ensureDir } from "fs-extra";
import { unpackTar } from "modern-tar/fs";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

/**
 * Download and extract a tarball to a destination directory
 * @param url - the url of the tarball to download
 * @param destination - the destination directory to extract the tarball to
 */
type DownloadAndExtractOptions = {
    url: string;
    destination: string;
    stripComponents?: number;
};
export const downloadAndExtract = async (
    options: DownloadAndExtractOptions,
) => {
    const { url, destination, stripComponents = 0 } = options;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`);
    }

    // Create destination directory if it doesn't exist
    await ensureDir(destination);

    // Stream download → gunzip → extract
    const extractStream = unpackTar(destination, {
        map: (header) => {
            if (stripComponents > 0) {
                header.name = header.name
                    .split("/")
                    .splice(stripComponents)
                    .join("/");
            }
            return header;
        },
    });

    await pipeline(
        response.body as ReadableStream,
        createGunzip(),
        extractStream,
    );
};
