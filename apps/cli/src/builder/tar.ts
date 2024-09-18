import fs from "fs-extra";
import path from "path";
import { TarDriveConfig } from "../config.js";
import { genext2fs, mksquashfs } from "../exec/index.js";

export const build = async (
    name: string,
    drive: TarDriveConfig,
    sdkImage: string,
    destination: string,
): Promise<void> => {
    const tar = `${name}.tar`;
    const filename = `${name}.${drive.format}`;

    // copy input tar to destination directory (with drive name)
    await fs.copy(drive.filename, path.join(destination, tar));

    switch (drive.format) {
        case "ext2": {
            await genext2fs.fromTar({
                extraSize: drive.extraSize,
                input: tar,
                output: filename,
                cwd: destination,
                image: sdkImage,
            });
            break;
        }
        case "sqfs": {
            await mksquashfs.fromTar({
                input: path.join(destination, tar),
                output: filename,
                cwd: destination,
                image: sdkImage,
            });
            break;
        }
    }
};
