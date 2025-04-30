import { defaults } from "@ipld/unixfs/file";
import { filesFromPaths } from "files-from-path";
import fs from "fs-extra";
import type { Block } from "ipfs-car";
import { CAREncoderStream, createDirectoryEncoderStream } from "ipfs-car";
import path from "path";
import { Writable } from "stream";

export type carDetails = {
    Hash: string;
    Size: number;
    CumulativeSize: number;
    Blocks: number;
    Type: string;
};

export const createCarFromDirectory = async (
    sourceDir: string,
    outputDir: string,
): Promise<carDetails> => {
    const files = await filesFromPaths([sourceDir]);
    let rootCID: any;
    const outputStream = fs.createWriteStream(
        path.join(outputDir, "image.car"),
    );
    const blocks: Block[] = [];

    await createDirectoryEncoderStream(files, defaults())
        .pipeThrough(
            new TransformStream({
                transform(block, controller) {
                    rootCID = block.cid;
                    blocks.push(block);
                    controller.enqueue(block);
                },
            }),
        )
        .pipeThrough(new CAREncoderStream())
        .pipeTo(Writable.toWeb(outputStream));

    const cidStr = rootCID.toString();

    fs.writeFileSync(path.join(outputDir, "image.cid"), cidStr);

    const carStats = fs.statSync(path.join(outputDir, "image.car"));
    const jsonOutput = {
        Hash: cidStr,
        Size: 0,
        CumulativeSize: carStats.size,
        Blocks: blocks.length,
        Type: "directory",
    };

    fs.writeFileSync(
        path.join(outputDir, "image.car.json"),
        JSON.stringify(jsonOutput),
    );

    fs.writeFileSync(
        path.join(outputDir, "image.size"),
        carStats.size.toString(),
    );

    return jsonOutput;
};
