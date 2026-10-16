import fs from "fs-extra";
import path from "node:path";
import type { TarDriveConfig } from "../config.js";
import { mkext2, mksquashfs } from "../exec/index.js";
import type { Reporter } from "../exec/util.js";

export const build = async (
    name: string,
    drive: TarDriveConfig,
    sdkImage: string,
    destination: string,
    reporter?: Reporter,
): Promise<void> => {
    const tar = `${name}.tar`;
    const filename = `${name}.${drive.format}`;

    // copy input tar to destination directory (with drive name)
    await fs.copy(drive.filename, path.join(destination, tar));

    switch (drive.format) {
        case "ext2": {
            await mkext2.fromTar({
                extraSize: drive.extraSize,
                input: tar,
                output: filename,
                cwd: destination,
                reporter,
            });
            break;
        }
        case "sqfs": {
            await mksquashfs.fromTar({
                input: path.join(destination, tar),
                output: filename,
                cwd: destination,
                image: sdkImage,
                reporter,
            });
            break;
        }
    }
};
