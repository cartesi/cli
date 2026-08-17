import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs-extra";
import path from "node:path";
import { type SemVer, satisfies } from "semver";
import { genext2fs } from "../../../src/exec/index.js";

describe("genext2fs", () => {
    let destination: string;

    beforeEach(async () => {
        destination = await fs.mkdtemp(path.join(__dirname, "genext2fs-"));
    });

    afterEach(async () => {
        await fs.remove(destination);
    });

    it("should report the version of the bundled xgenext2fs", () => {
        const version = genext2fs.version();

        expect(version).toBeDefined();
        expect(
            satisfies((version as SemVer).format(), genext2fs.requiredVersion),
        ).toBeTruthy();
    });

    it("should create an empty drive of the requested size", async () => {
        await genext2fs.empty({
            cwd: destination,
            output: "data.ext2",
            size: 1024 * 1024,
        });

        const stat = await fs.stat(path.join(destination, "data.ext2"));
        expect(stat.isFile()).toBeTruthy();
        expect(stat.size).toEqual(1024 * 1024);
    });

    it("should fail to create an empty drive with no blocks", async () => {
        await expect(
            genext2fs.empty({
                cwd: destination,
                output: "data.ext2",
                size: 0,
            }),
        ).rejects.toThrow("too few blocks");
    });

    it("should create a drive from a directory", async () => {
        const input = path.join(destination, "input");
        await fs.outputFile(path.join(input, "hello.txt"), "hello");

        await genext2fs.fromDirectory({
            cwd: destination,
            extraSize: 1024 * 1024,
            input: "input",
            output: "data.ext2",
        });

        const stat = await fs.stat(path.join(destination, "data.ext2"));
        expect(stat.isFile()).toBeTruthy();
        expect(stat.size).toBeGreaterThan(0);
    });

    it("should produce reproducible drives", async () => {
        const input = path.join(destination, "input");
        await fs.outputFile(path.join(input, "hello.txt"), "hello");

        const outputs = ["one.ext2", "two.ext2"];
        for (const output of outputs) {
            await genext2fs.fromDirectory({
                cwd: destination,
                extraSize: 1024 * 1024,
                input: "input",
                output,
            });
        }

        const [one, two] = await Promise.all(
            outputs.map((output) =>
                fs.readFile(path.join(destination, output)),
            ),
        );
        expect(one.equals(two)).toBeTruthy();
    });
});
