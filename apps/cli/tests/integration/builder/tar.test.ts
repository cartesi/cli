import fs from "fs-extra";
import path from "node:path";
import { describe, expect } from "vitest";
import { build } from "../../../src/builder/tar.js";
import type { TarDriveConfig } from "../../../src/config.js";
import { TEST_SDK } from "../config.js";
import { tmpdirTest } from "./tmpdirTest.js";

describe("when building with the tar builder", () => {
    const image = TEST_SDK;

    tmpdirTest("should not build a missing file", async ({ tmpdir }) => {
        const destination = tmpdir;
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

    tmpdirTest("should build a ext2 drive", async ({ tmpdir }) => {
        const destination = tmpdir;
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

    tmpdirTest("should build a sqfs drive", async ({ tmpdir }) => {
        const destination = tmpdir;
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
