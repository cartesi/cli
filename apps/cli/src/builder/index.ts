import { execaDockerFallback, OptionsDockerFallback } from "../exec.js";

export { build as buildDirectory } from "./directory.js";
export { build as buildDocker } from "./docker.js";
export { build as buildEmpty } from "./empty.js";
export { build as buildNone } from "./none.js";
export { build as buildTar } from "./tar.js";

export const tarToExt = async (
    input: string,
    output: string,
    format: "ext2",
    extraSize: number,
    options: OptionsDockerFallback,
) => {
    const blockSize = 4096; // fixed at 4k
    const extraBlocks = Math.ceil(extraSize / blockSize);
    const adjustment = `+${extraBlocks}`;

    const command = "xgenext2fs";
    const args = [
        "--block-size",
        blockSize.toString(),
        "--faketime",
        "--root",
        output,
        "--readjustment",
        adjustment.toString(),
        "--tarball",
        input,
    ];
    return execaDockerFallback(command, args, options);
};
