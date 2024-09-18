import fs from "fs-extra";
import path from "path";
import { EmptyDriveConfig } from "../config.js";
import { genext2fs } from "../exec/index.js";

export const build = async (
    name: string,
    drive: EmptyDriveConfig,
    sdkImage: string,
    destination: string,
): Promise<void> => {
    const filename = `${name}.${drive.format}`;
    switch (drive.format) {
        case "ext2": {
            await genext2fs.empty({
                output: filename,
                size: drive.size,
                cwd: destination,
                image: sdkImage,
            });
            break;
        }
        case "raw": {
            await fs.writeFile(
                path.join(destination, filename),
                Buffer.alloc(drive.size),
            );
            break;
        }
    }
};
