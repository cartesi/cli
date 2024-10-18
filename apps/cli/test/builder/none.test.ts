import fs from "fs-extra";
import path from "path";
import { describe, expect } from "vitest";
import { build } from "../../src/builder/none";
import { ExistingDriveConfig } from "../../src/config";
import { tmpdirTest } from "./tmpdirTest";

describe("when building with the none builder", () => {
    tmpdirTest("should not build a missing file", async ({ tmpdir }) => {
        const destination = tmpdir;
        const drive: ExistingDriveConfig = {
            builder: "none",
            filename: path.join(__dirname, "data", "missing.ext2"),
            format: "ext2",
        };
        await expect(build("root", drive, destination)).rejects.toThrow(
            "no such file or directory",
        );
    });

    tmpdirTest("should just copy an existing drive", async ({ tmpdir }) => {
        const destination = tmpdir;
        const filename = path.join(__dirname, "data", "data.ext2");
        const drive: ExistingDriveConfig = {
            builder: "none",
            filename,
            format: "ext2",
        };
        await build("root", drive, destination);
        const src = fs.statSync(filename);
        const dest = fs.statSync(path.join(destination, "root.ext2"));
        expect(dest.size).toEqual(src.size);
    });
});
