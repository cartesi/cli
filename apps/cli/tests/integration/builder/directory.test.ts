import fs from "fs-extra";
import path from "path";
import { describe, expect } from "vitest";
import { build } from "../../../src/builder/directory";
import { DEFAULT_SDK, DirectoryDriveConfig } from "../../../src/config";
import { tmpdirTest } from "./tmpdirTest";

describe("when building with the directory builder", () => {
    const image = DEFAULT_SDK;

    tmpdirTest(
        "should fail when the directory doesn't exists",
        async ({ tmpdir }) => {
            const destination = tmpdir;
            const drive: DirectoryDriveConfig = {
                builder: "directory",
                directory: path.join(__dirname, "data", "invalid"),
                extraSize: 0,
                format: "ext2",
            };
            await expect(
                build("root", drive, image, destination),
            ).rejects.toThrow("no such file or directory");
        },
    );

    tmpdirTest(
        "should fail when the directory is empty",
        async ({ tmpdir }) => {
            const destination = tmpdir;
            const directory = path.join(__dirname, "data", "empty");
            fs.ensureDirSync(directory);
            const drive: DirectoryDriveConfig = {
                builder: "directory",
                directory,
                extraSize: 0,
                format: "ext2",
            };
            await expect(
                build("root", drive, image, destination),
            ).rejects.toThrow("too few blocks");
        },
    );

    tmpdirTest(
        "should pass when the directory is empty but extra size is defined",
        async ({ tmpdir }) => {
            const destination = tmpdir;
            const directory = path.join(__dirname, "data", "empty");
            fs.ensureDirSync(directory);
            const drive: DirectoryDriveConfig = {
                builder: "directory",
                directory,
                extraSize: 1024 * 1024, // 1Mb
                format: "ext2",
            };
            await build("root", drive, image, destination);
            const filename = path.join(destination, "root.ext2");
            const stat = fs.statSync(filename);
            expect(stat.size).toEqual(1069056);
        },
    );

    tmpdirTest(
        "should pass for a populated directory (ext2)",
        async ({ tmpdir }) => {
            const destination = tmpdir;
            const drive: DirectoryDriveConfig = {
                builder: "directory",
                directory: path.join(__dirname, "fixtures", "sample1"),
                extraSize: 0,
                format: "ext2",
            };
            await build("root", drive, image, destination);
            const filename = path.join(destination, "root.ext2");
            const stat = fs.statSync(filename);
            expect(stat.size).toEqual(32768);
        },
    );

    tmpdirTest(
        "should pass for a populated directory (sqfs)",
        async ({ tmpdir }) => {
            const destination = tmpdir;
            const drive: DirectoryDriveConfig = {
                builder: "directory",
                directory: path.join(__dirname, "fixtures", "sample1"),
                extraSize: 0,
                format: "sqfs",
            };
            await build("root", drive, image, destination);
            const filename = path.join(destination, "root.sqfs");
            const stat = fs.statSync(filename);
            expect(stat.size).toEqual(4096);
        },
    );
});
