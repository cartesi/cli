import chalk from "chalk";
import { filesFromPaths } from "files-from-path";
import fs from "fs-extra";
import type { Block } from "ipfs-car";
import { CAREncoderStream, createDirectoryEncoderStream } from "ipfs-car";
import path from "path";
import { Writable } from "stream";

export const createCarFromDirectory = async (
    sourceDir: string,
    outputDir: string,
) => {
    try {
        const files = await filesFromPaths([sourceDir]);
        let rootCID: any;
        const outputStream = fs.createWriteStream(
            path.join(outputDir, "image.car"),
        );
        const blocks: Block[] = [];

        await createDirectoryEncoderStream(files)
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
        console.log(`✔️ Packed directory to CAR. Root CID: ${cidStr}`);

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
        console.log(chalk.green("🎉 CAR and JSON files successfully created!"));
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
};
