import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs-extra";
import path from "node:path";
import { build } from "../../../src/builder/nvram.js";
import type { NvramConfig } from "../../../src/config.js";
import { cleanupTempDir, createTempDir } from "./tmpdirTest.js";

describe("when building an nvram", () => {
    let destination: string;
    let source: string;

    beforeEach(async () => {
        destination = await createTempDir();
        source = await createTempDir();
    });

    afterEach(async () => {
        await cleanupTempDir(destination);
        await cleanupTempDir(source);
    });

    // writes a raw image of the given size in the source directory
    const writeImage = async (name: string, size: number) => {
        const filename = path.join(source, name);
        await fs.writeFile(filename, Buffer.alloc(size, 1));
        return filename;
    };

    it("should not build an image for a pristine nvram", async () => {
        const nvram: NvramConfig = { size: 4096 };
        await build("input", nvram, destination);
        expect(fs.existsSync(path.join(destination, "input.raw"))).toBeFalsy();
    });

    it("should build a zero filled image for a shared nvram", async () => {
        const nvram: NvramConfig = { size: 8192, shared: true };
        await build("output", nvram, destination);

        const filename = path.join(destination, "output.raw");
        const stat = await fs.stat(filename);
        expect(stat.isFile()).toBeTruthy();
        expect(stat.size).toEqual(8192);
        expect(await fs.readFile(filename)).toEqual(Buffer.alloc(8192));
    });

    it("should copy an existing image", async () => {
        const filename = await writeImage("seed.raw", 4096);
        await build("seed", { filename }, destination);

        const copy = path.join(destination, "seed.raw");
        expect(await fs.readFile(copy)).toEqual(await fs.readFile(filename));
    });

    it("should fail for a missing image", async () => {
        const filename = path.join(source, "missing.raw");
        await expect(build("seed", { filename }, destination)).rejects.toThrow(
            "no such file or directory",
        );
    });

    it("should fail when the size does not match the image", async () => {
        const filename = await writeImage("seed.raw", 4096);
        await expect(
            build("seed", { filename, size: 8192 }, destination),
        ).rejects.toThrow(
            `Size 8192 of nvram 'seed' does not match the 4096 bytes of ${filename}`,
        );
    });

    it("should fail when the image size is not a multiple of 4096", async () => {
        const filename = await writeImage("seed.raw", 5000);
        await expect(build("seed", { filename }, destination)).rejects.toThrow(
            "which is not a multiple of 4096",
        );
    });
});
