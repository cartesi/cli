import fs from "fs-extra";
import path from "path";
import { tarToExt } from ".";
import { TarDriveConfig } from "../config";
import { execaDockerFallback } from "../exec";

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
            await tarToExt(tar, filename, drive.format, drive.extraSize, {
                cwd: destination,
                image: sdkImage,
            });
            break;
        }
        case "sqfs": {
            const compression = "lzo"; // make customizable? default is gzip
            const command = "mksquashfs";
            const args = [
                "-tar",
                "-all-time",
                "0",
                "-all-root", // XXX: should we use this?
                "-noappend",
                "-comp",
                compression,
                "-no-progress",
                filename,
            ];
            await execaDockerFallback(command, args, {
                cwd: destination,
                image: sdkImage,
                inputFile: tar,
            });
            break;
        }
    }
};
