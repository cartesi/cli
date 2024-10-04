import fs from "fs-extra";
import path from "path";
import { DirectoryDriveConfig } from "../config";
import { execaDockerFallback } from "../exec";

export const build = async (
    name: string,
    drive: DirectoryDriveConfig,
    sdkImage: string,
    destination: string,
): Promise<void> => {
    const filename = `${name}.${drive.format}`;
    const blockSize = 4096; // fixed at 4k
    const extraBlocks = Math.ceil(drive.extraSize / blockSize);
    const extraSize = `+${extraBlocks}`;

    // copy directory to destination
    const dest = path.join(destination, name);
    await fs.mkdirp(dest);
    await fs.copy(drive.directory, dest);

    try {
        switch (drive.format) {
            case "ext2": {
                const command = "xgenext2fs";
                const args = [
                    "--block-size",
                    blockSize.toString(),
                    "--faketime",
                    "--root",
                    name,
                    "--readjustment",
                    extraSize,
                ];
                await execaDockerFallback(command, args, {
                    cwd: destination,
                    image: sdkImage,
                });
                break;
            }
            case "sqfs": {
                const compression = "lzo"; // make customizable? default is gzip
                const command = "mksquashfs";
                const args = [
                    "-all-time",
                    "0",
                    "-all-root", // XXX: should we use this?
                    "-noappend",
                    "-comp",
                    compression,
                    "-no-progress",
                    name,
                    filename,
                ];
                await execaDockerFallback(command, args, {
                    cwd: destination,
                    image: sdkImage,
                });
            }
        }
    } finally {
        // delete copied
        await fs.remove(dest);
    }
};
