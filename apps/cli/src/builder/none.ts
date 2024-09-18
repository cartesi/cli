import fs from "fs-extra";
import path from "path";
import { ExistingDriveConfig, getDriveFormat } from "../config.js";

export const build = async (
    name: string,
    drive: ExistingDriveConfig,
    destination: string,
): Promise<void> => {
    // no need to build, drive already exists
    const src = drive.filename;
    const format = getDriveFormat(src);
    const filename = path.join(destination, `${name}.${format}`);

    // just copy it
    await fs.copyFile(src, filename);
};
