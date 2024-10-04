import { execaDockerFallback, OptionsDockerFallback } from "../exec";

export { build as buildDirectory } from "./directory";
export { build as buildDocker } from "./docker";
export { build as buildEmpty } from "./empty";
export { build as buildNone } from "./none";
export { build as buildTar } from "./tar";

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
