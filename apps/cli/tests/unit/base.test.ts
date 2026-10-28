import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getMachineHash } from "../../src/base.js";
import { InvalidBuilderError } from "../../src/config.js";

describe("getMachineHash", () => {
    it("should fail on an invalid cartesi.toml instead of hashing with the default sdk image", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "base-"));
        const cwd = process.cwd();
        try {
            // a snapshot exists, so the hash would be computed with the project sdk
            fs.mkdirSync(path.join(dir, ".cartesi", "image"), {
                recursive: true,
            });
            fs.writeFileSync(
                path.join(dir, "cartesi.toml"),
                '[drives.root]\nbuilder = "invalid"\n',
            );
            process.chdir(dir);

            await expect(getMachineHash()).rejects.toThrowError(
                new InvalidBuilderError("invalid"),
            );
        } finally {
            process.chdir(cwd);
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
