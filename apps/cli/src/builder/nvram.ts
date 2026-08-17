import fs from "fs-extra";
import path from "node:path";
import {
    MissingNvramSourceError,
    NVRAM_ALIGNMENT,
    type NvramConfig,
    nvramHasImage,
    nvramImageFilename,
} from "../config.js";

export const build = async (
    label: string,
    nvram: NvramConfig,
    destination: string,
): Promise<void> => {
    // a pristine nvram needs no image, cartesi-machine fills its range with zeros
    if (!nvramHasImage(nvram)) {
        return;
    }

    const target = path.join(destination, nvramImageFilename(label));
    const source = nvram.filename;

    if (source === undefined) {
        // shared with no image of its own, start it filled with zeros
        if (nvram.size === undefined) {
            throw new MissingNvramSourceError(label);
        }
        await fs.writeFile(target, Buffer.alloc(nvram.size));
        return;
    }

    const { size } = await fs.stat(source);
    if (nvram.size !== undefined && nvram.size !== size) {
        throw new Error(
            `Size ${nvram.size} of nvram '${label}' does not match the ${size} bytes of ${source}`,
        );
    }
    if (size % NVRAM_ALIGNMENT !== 0) {
        throw new Error(
            `Image ${source} of nvram '${label}' has ${size} bytes, which is not a multiple of ${NVRAM_ALIGNMENT}`,
        );
    }

    // copy it into the destination, so it is reachable when running inside the sdk image
    await fs.copyFile(source, target);
};
