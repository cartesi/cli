import fs from "fs-extra";
import path from "path";
import { describe, expect } from "vitest";
import { build } from "../../src/builder/empty";
import { EmptyDriveConfig } from "../../src/config";
import { tmpdirTest } from "./tmpdirTest";

describe("when building with the empty builder", () => {
    const image = "cartesi/sdk:0.11.0";

    tmpdirTest("should fail with an invalid size", async ({ tmpdir }) => {
        const destination = tmpdir;
        const drive: EmptyDriveConfig = {
            builder: "empty",
            format: "ext2",
            size: 0,
        };
        await expect(build("root", drive, image, destination)).rejects.toThrow(
            "too few blocks",
        );
    });

    tmpdirTest("should pass and create ext2 drive", async ({ tmpdir }) => {
        const destination = tmpdir;
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

    tmpdirTest("should pass and create raw drive", async ({ tmpdir }) => {
        const destination = tmpdir;
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
