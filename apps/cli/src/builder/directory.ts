import fs from "fs-extra";
import path from "node:path";
import type { DirectoryDriveConfig } from "../config.js";
import { genext2fs, mksquashfs } from "../exec/index.js";

export const build = async (
    name: string,
    drive: DirectoryDriveConfig,
    sdkImage: string,
    destination: string,
    debug: boolean,
): Promise<void> => {
    const filename = `${name}.${drive.format}`;

    // copy directory to destination
    const dest = path.join(destination, name);
    await fs.mkdirp(dest);
    await fs.copy(drive.directory, dest);

    try {
        switch (drive.format) {
            case "ext2": {
                await genext2fs.fromDirectory({
                    extraSize: drive.extraSize,
                    input: name,
                    output: filename,
                    cwd: destination,
                    image: sdkImage,
                });
                break;
            }
            case "sqfs": {
                await mksquashfs.fromDirectory({
                    input: name,
                    output: filename,
                    cwd: destination,
                    image: sdkImage,
                });
                break;
            }
        }
    } finally {
        // delete copied
        if (!debug) {
            await fs.remove(dest);
        }
    }
};
