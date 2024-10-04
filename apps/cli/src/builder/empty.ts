import fs from "fs-extra";
import path from "path";
import { EmptyDriveConfig } from "../config";
import { execaDockerFallback } from "../exec";

export const build = async (
    name: string,
    drive: EmptyDriveConfig,
    sdkImage: string,
    destination: string,
): Promise<void> => {
    const filename = `${name}.${drive.format}`;
    switch (drive.format) {
        case "ext2": {
            const blockSize = 4096; // fixed at 4k
            const size = Math.ceil(drive.size / blockSize); // size in blocks
            const command = "xgenext2fs";
            const args = [
                "--block-size",
                blockSize.toString(),
                "--faketime",
                "--size-in-blocks",
                size.toString(),
                filename,
            ];
            await execaDockerFallback(command, args, {
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
