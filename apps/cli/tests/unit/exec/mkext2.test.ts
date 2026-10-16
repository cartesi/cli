import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs-extra";
import path from "node:path";
import { satisfies, type SemVer } from "semver";
import { mkext2 } from "../../../src/exec/index.js";

describe("mkext2", () => {
    let destination: string;

    beforeEach(async () => {
        destination = await fs.mkdtemp(path.join(__dirname, "mkext2-"));
    });

    afterEach(async () => {
        await fs.remove(destination);
    });

    it("should report a supported version of the bindings", () => {
        const version = mkext2.version();

        expect(version).not.toBeNull();
        expect(
            satisfies((version as SemVer).format(), mkext2.requiredVersion),
        ).toBeTruthy();
    });

    it("should create an empty drive of the requested size", async () => {
        await mkext2.empty({
            cwd: destination,
            output: "data.ext2",
            size: 1024 * 1024,
        });

        const stat = await fs.stat(path.join(destination, "data.ext2"));
        expect(stat.isFile()).toBeTruthy();
        expect(stat.size).toEqual(1024 * 1024);
    });

    it("should refuse an empty drive without a size", async () => {
        // mkext2 would raise the size to fit an empty filesystem, which is
        // never what the configuration meant
        await expect(
            mkext2.empty({
                cwd: destination,
                output: "data.ext2",
                size: 0,
            }),
        ).rejects.toThrow("An empty drive needs a size");
    });

    it("should reserve no blocks, leaving the whole drive to the application", async () => {
        const result = await mkext2.empty({
            cwd: destination,
            output: "data.ext2",
            size: 1024 * 1024,
        });

        expect(result.reservedBlocks).toEqual(0);
    });

    it("should create a drive from a directory", async () => {
        await fs.outputFile(
            path.join(destination, "input", "hello.txt"),
            "hello",
        );

        await mkext2.fromDirectory({
            cwd: destination,
            extraSize: 1024 * 1024,
            input: "input",
            output: "data.ext2",
        });

        const stat = await fs.stat(path.join(destination, "data.ext2"));
        expect(stat.isFile()).toBeTruthy();
        expect(stat.size).toBeGreaterThan(0);
    });

    it("should create a drive from a tar", async () => {
        const input = path.join(destination, "input");
        await fs.outputFile(path.join(input, "hello.txt"), "hello");
        const tar = path.join(destination, "input.tar");
        await Bun.$`tar -cf ${tar} -C ${input} .`.quiet();

        await mkext2.fromTar({
            cwd: destination,
            extraSize: 1024 * 1024,
            input: "input.tar",
            output: "data.ext2",
        });

        const stat = await fs.stat(path.join(destination, "data.ext2"));
        expect(stat.isFile()).toBeTruthy();
        expect(stat.size).toBeGreaterThan(0);
    });

    it("should produce reproducible drives", async () => {
        await fs.outputFile(
            path.join(destination, "input", "hello.txt"),
            "hello",
        );

        const outputs = ["one.ext2", "two.ext2"];
        for (const output of outputs) {
            await mkext2.fromDirectory({
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

    it("should report what it did to the reporter", async () => {
        await fs.outputFile(
            path.join(destination, "input", "hello.txt"),
            "hello",
        );
        const lines: string[] = [];

        await mkext2.fromDirectory({
            cwd: destination,
            extraSize: 1024 * 1024,
            input: "input",
            output: "data.ext2",
            reporter: (line) => lines.push(line),
        });

        expect(lines.join("\n")).toContain("adding directory");
    });
});
