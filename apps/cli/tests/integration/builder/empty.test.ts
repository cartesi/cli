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
import { build } from "../../../src/builder/empty.js";
import type { EmptyDriveConfig } from "../../../src/config/index.js";
import { setupIntegrationTests, TEST_SDK } from "../config.js";
import { cleanupTempDir, createTempDir } from "./tmpdirTest.js";

beforeAll(
    async () => {
        await setupIntegrationTests();
    },
    { timeout: 60000 },
);

describe("when building with the empty builder", () => {
    const image = TEST_SDK;
    let destination: string;

    beforeEach(async () => {
        destination = await createTempDir();
    });

    afterEach(async () => {
        await cleanupTempDir(destination);
    });

    it("should fail with an invalid size", async () => {
        const drive: EmptyDriveConfig = {
            builder: "empty",
            format: "ext2",
            size: 0,
        };
        await expect(build("root", drive, image, destination)).rejects.toThrow(
            "too few blocks",
        );
    });

    it("should pass and create ext2 drive", async () => {
        const driveName = "root.ext2";
        const drive: EmptyDriveConfig = {
            builder: "empty",
            format: "ext2",
            size: 1024 * 1024 * 1, // 1Mb
        };
        await build("root", drive, image, destination);

        const filename = path.join(destination, driveName);
        expect(fs.existsSync(filename)).toBeTruthy();
        const stat = await fs.stat(filename);
        expect(stat.isFile()).toBeTruthy();
        expect(stat.size).toEqual(1 * 1024 * 1024);
    });

    it("should pass and create raw drive", async () => {
        const driveName = "root.raw";
        const drive: EmptyDriveConfig = {
            builder: "empty",
            format: "raw",
            size: 1024 * 1024 * 1, // 1Mb
        };
        await build("root", drive, image, destination);

        const filename = path.join(destination, driveName);
        expect(fs.existsSync(filename)).toBeTruthy();
        const stat = await fs.stat(filename);
        expect(stat.isFile()).toBeTruthy();
        expect(stat.size).toEqual(1 * 1024 * 1024);
    });
});
