import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "bun:test";
import fs from "fs-extra";
import path from "node:path";
import { build } from "../../../src/builder/directory.js";
import type { DirectoryDriveConfig } from "../../../src/config/index.js";
import { setupIntegrationTests, TEST_SDK } from "../config.js";
import { cleanupTempDir, createTempDir } from "./tmpdirTest.js";

beforeAll(
    async () => {
        await setupIntegrationTests();
    },
    { timeout: 60000 },
);

describe("when building with the directory builder", () => {
    const image = TEST_SDK;
    let destination: string;

    beforeEach(async () => {
        destination = await createTempDir();
    });

    afterEach(async () => {
        await cleanupTempDir(destination);
    });

    it("should fail when the directory doesn't exists", async () => {
        const drive: DirectoryDriveConfig = {
            builder: "directory",
            directory: path.join(__dirname, "data", "invalid"),
            extraSize: 0,
            format: "ext2",
        };
        await expect(
            build("root", drive, image, destination, false),
        ).rejects.toThrow("no such file or directory");
    });

    it("should fail when the directory is empty", async () => {
        const directory = path.join(__dirname, "data", "empty");
        fs.ensureDirSync(directory);
        const drive: DirectoryDriveConfig = {
            builder: "directory",
            directory,
            extraSize: 0,
            format: "ext2",
        };
        await expect(
            build("root", drive, image, destination, false),
        ).rejects.toThrow("too few blocks");
    });

    it("should pass when the directory is empty but extra size is defined", async () => {
        const directory = path.join(__dirname, "data", "empty");
        fs.ensureDirSync(directory);
        const drive: DirectoryDriveConfig = {
            builder: "directory",
            directory,
            extraSize: 1024 * 1024, // 1Mb
            format: "ext2",
        };
        await build("root", drive, image, destination, false);
        const filename = path.join(destination, "root.ext2");
        const stat = fs.statSync(filename);
        expect(stat.size).toEqual(1069056);
    });

    it("should pass for a populated directory (ext2)", async () => {
        const drive: DirectoryDriveConfig = {
            builder: "directory",
            directory: path.join(__dirname, "fixtures", "sample1"),
            extraSize: 0,
            format: "ext2",
        };
        await build("root", drive, image, destination, false);
        const filename = path.join(destination, "root.ext2");
        const stat = fs.statSync(filename);
        expect(stat.size).toEqual(32768);
    });

    it("should pass for a populated directory (sqfs)", async () => {
        const drive: DirectoryDriveConfig = {
            builder: "directory",
            directory: path.join(__dirname, "fixtures", "sample1"),
            extraSize: 0,
            format: "sqfs",
        };
        await build("root", drive, image, destination, false);
        const filename = path.join(destination, "root.sqfs");
        const stat = fs.statSync(filename);
        expect(stat.size).toEqual(4096);
    });
});
