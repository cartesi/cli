import bytes from "bytes";
import fs from "fs-extra";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import type { Reporter } from "./exec/util.js";

/**
 * Version of https://github.com/cartesi/machine-linux-image the machine boots
 * by default, matched to the emulator version @cartesi/machine is linked against.
 */
export const DEFAULT_LINUX_IMAGE_VERSION = "0.21.0";
export const DEFAULT_LINUX_KERNEL_VERSION = "6.5.13-ctsi-2";
const DEFAULT_LINUX_KERNEL_SHA256 =
    "5c900060da2db2bfa84cd39cd9cd722988c83c42225f3cac55f2d3157e48f32f";

const RELEASE_URL = `https://github.com/cartesi/machine-linux-image/releases/download/v${DEFAULT_LINUX_IMAGE_VERSION}/linux-${DEFAULT_LINUX_KERNEL_VERSION}-v${DEFAULT_LINUX_IMAGE_VERSION}.bin`;

export class ImageDownloadError extends Error {
    constructor(url: string, reason: string) {
        super(`Failed to download ${url}: ${reason}`);
        this.name = "ImageDownloadError";
    }
}

export class ImageChecksumError extends Error {
    constructor(filename: string, expected: string, actual: string) {
        super(
            `Checksum mismatch for ${filename}: expected ${expected}, got ${actual}`,
        );
        this.name = "ImageChecksumError";
    }
}

/**
 * Directory the CLI caches downloaded machine images in. Honors XDG_CACHE_HOME
 * when set, and falls back to the platform home directory otherwise.
 */
export const getCacheDir = (): string => {
    const base =
        process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache");
    return path.join(base, "cartesi", "images");
};

const sha256 = async (filename: string): Promise<string> => {
    const hash = createHash("sha256");
    for await (const chunk of fs.createReadStream(filename)) {
        hash.update(chunk as Buffer);
    }
    return hash.digest("hex");
};

const download = async (
    url: string,
    destination: string,
    checksum: string,
    reporter?: Reporter,
): Promise<void> => {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
        throw new ImageDownloadError(
            url,
            `${response.status} ${response.statusText}`,
        );
    }

    const total = Number(response.headers.get("content-length") ?? 0);
    await fs.mkdirp(path.dirname(destination));

    // download to a temporary file next to the destination, so a partial or
    // corrupt download is never mistaken for a cached image
    const partial = `${destination}.${process.pid}.part`;
    try {
        const hash = createHash("sha256");
        let downloaded = 0;
        let reported = -1;
        const file = fs.createWriteStream(partial);
        try {
            for await (const chunk of response.body) {
                const buffer = chunk as Uint8Array;
                hash.update(buffer);
                downloaded += buffer.byteLength;
                if (!file.write(buffer)) {
                    await new Promise((resolve) => file.once("drain", resolve));
                }
                // report every 10%, chunks are far too small to be worth a
                // line each
                const percent =
                    total > 0 ? Math.floor((downloaded * 10) / total) * 10 : -1;
                if (reporter && percent > reported) {
                    reported = percent;
                    reporter(
                        `Downloading ${path.basename(destination)}: ${bytes(downloaded)} of ${bytes(total)} (${percent}%)`,
                    );
                }
            }
        } finally {
            await new Promise<void>((resolve, reject) =>
                file.end((error?: Error) =>
                    error ? reject(error) : resolve(),
                ),
            );
        }

        const actual = hash.digest("hex");
        if (actual !== checksum) {
            throw new ImageChecksumError(
                path.basename(destination),
                checksum,
                actual,
            );
        }

        await fs.move(partial, destination, { overwrite: true });
    } finally {
        await fs.remove(partial);
    }
};

/**
 * Resolves the Linux kernel image the machine boots from, downloading it into
 * the cache directory on first use.
 *
 * The lookup order is the CARTESI_IMAGES_PATH directory (the same environment
 * variable the cartesi-machine CLI honors), then the cache directory, and
 * finally the pinned machine-linux-image release.
 */
export const getRamImage = async (reporter?: Reporter): Promise<string> => {
    const filename = `linux-${DEFAULT_LINUX_KERNEL_VERSION}-v${DEFAULT_LINUX_IMAGE_VERSION}.bin`;

    const imagesPath = process.env.CARTESI_IMAGES_PATH;
    if (imagesPath) {
        for (const candidate of [
            path.join(imagesPath, filename),
            path.join(imagesPath, "linux.bin"),
        ]) {
            if (await fs.pathExists(candidate)) {
                return candidate;
            }
        }
    }

    const cached = path.join(getCacheDir(), filename);
    if (await fs.pathExists(cached)) {
        // a cached image with the wrong contents is a corrupt cache, not a
        // reason to fail: drop it and download again
        if ((await sha256(cached)) === DEFAULT_LINUX_KERNEL_SHA256) {
            return cached;
        }
        await fs.remove(cached);
    }

    reporter?.(`Downloading Linux kernel image ${filename}`);
    await download(RELEASE_URL, cached, DEFAULT_LINUX_KERNEL_SHA256, reporter);
    return cached;
};
