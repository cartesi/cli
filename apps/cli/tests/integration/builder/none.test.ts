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
import { build } from "../../../src/builder/none.js";
import type { ExistingDriveConfig } from "../../../src/config/index.js";
import { setupIntegrationTests } from "../config.js";
import { cleanupTempDir, createTempDir } from "./tmpdirTest.js";

beforeAll(
    async () => {
        await setupIntegrationTests();
    },
    { timeout: 60000 },
);

describe("when building with the none builder", () => {
    let destination: string;

    beforeEach(async () => {
        destination = await createTempDir();
    });

    afterEach(async () => {
        await cleanupTempDir(destination);
    });

    it("should not build a missing file", async () => {
        const drive: ExistingDriveConfig = {
            builder: "none",
            filename: path.join(__dirname, "data", "missing.ext2"),
            format: "ext2",
        };
        await expect(build("root", drive, destination)).rejects.toThrow(
            "no such file or directory",
        );
    });

    it("should just copy an existing drive", async () => {
        const filename = path.join(__dirname, "fixtures", "data.ext2");
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
