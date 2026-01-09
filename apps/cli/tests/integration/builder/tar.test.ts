import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs-extra";
import path from "node:path";
import { build } from "../../../src/builder/tar.js";
import type { TarDriveConfig } from "../../../src/config.js";
import { setupIntegrationTests, TEST_SDK } from "../config.js";
import { cleanupTempDir, createTempDir } from "./tmpdirTest.js";

beforeAll(async () => {
    await setupIntegrationTests();
}, { timeout: 60000 });

describe("when building with the tar builder", () => {
    const image = TEST_SDK;
    let destination: string;

    beforeEach(async () => {
        destination = await createTempDir();
    });

    afterEach(async () => {
        await cleanupTempDir(destination);
    });

    it("should not build a missing file", async () => {
        const drive: TarDriveConfig = {
            builder: "tar",
            filename: path.join(__dirname, "data", "unexisting.tar"),
            extraSize: 0,
            format: "ext2",
        };
        await expect(build("root", drive, image, destination)).rejects.toThrow(
            "no such file or directory",
        );
    });

    it("should build a ext2 drive", async () => {
        const drive: TarDriveConfig = {
            builder: "tar",
            filename: path.join(__dirname, "fixtures", "data.tar"),
            extraSize: 0,
            format: "ext2",
        };
        await build("root", drive, image, destination);
        const filename = path.join(destination, "root.ext2");
        const stat = fs.statSync(filename);
        expect(stat.size).toEqual(36864);
    });

    it("should build a sqfs drive", async () => {
        const drive: TarDriveConfig = {
            builder: "tar",
            filename: path.join(__dirname, "fixtures", "data.tar"),
            extraSize: 0,
            format: "sqfs",
        };
        await build("root", drive, image, destination);
        const filename = path.join(destination, "root.sqfs");
        const stat = fs.statSync(filename);
        expect(stat.size).toEqual(4096);
    });
});
