import fs from "fs-extra";
import path from "path";
import { describe, expect } from "vitest";
import { build } from "../../../src/builder/tar";
import { DEFAULT_SDK, TarDriveConfig } from "../../../src/config";
import { tmpdirTest } from "./tmpdirTest";

describe("when building with the tar builder", () => {
    const image = DEFAULT_SDK;

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
