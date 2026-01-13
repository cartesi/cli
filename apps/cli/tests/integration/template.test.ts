import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { download } from "../../src/template.js";
import { cleanupTempDir, createTempDir } from "./tmpdirTest.js";

describe("template.download", () => {
    let testOutputDir: string;

    beforeEach(async () => {
        testOutputDir = await createTempDir();
    });

    afterEach(async () => {
        await cleanupTempDir(testOutputDir);
    });

    it("should download and extract a template successfully", async () => {
        const template = "python";
        const branch = "main";

        const result = await download(template, branch, testOutputDir);

        expect(result.dir).toBe(testOutputDir);
        expect(result.source).toBe(
            "https://github.com/cartesi/application-templates",
        );

        // Verify files were extracted
        const glob = new Bun.Glob("*");
        const files = await Array.fromAsync(glob.scan(testOutputDir));
        expect(files.length).toBeGreaterThan(0);
        expect(files).toContain("requirements.txt");
    });

    it("should extract only files from the specified template directory", async () => {
        const template = "python";
        const branch = "main";

        await download(template, branch, testOutputDir);

        // Check that common template files exist
        const glob = new Bun.Glob("**/*");
        const fileNames = await Array.fromAsync(glob.scan(testOutputDir));

        // Should contain typical template files
        expect(fileNames.length).toBeGreaterThan(0);
        
        // Files should not contain the parent directory prefix
        const hasInvalidPrefix = fileNames.some((f) =>
            f.includes("application-templates-"),
        );
        expect(hasInvalidPrefix).toBe(false);
    });

    it("should throw an error when the download fails", async () => {
        const template = "python";
        const branch = "nonexistent-branch-xyz123";

        await expect(
            download(template, branch, testOutputDir),
        ).rejects.toThrow("Failed to download template:");
    });

    it("should handle different template types", async () => {
        const template = "cpp";
        const branch = "main";

        const result = await download(template, branch, testOutputDir);

        expect(result.dir).toBe(testOutputDir);
        
        const glob = new Bun.Glob("*");
        const files = await Array.fromAsync(glob.scan(testOutputDir));
        expect(files.length).toBeGreaterThan(0);
        expect(files).toContain("Makefile");
    });

    it("should create output directory if it doesn't exist", async () => {
        const template = "python";
        const branch = "main";
        const nestedDir = `${testOutputDir}/nested/path`;

        const result = await download(template, branch, nestedDir);

        expect(result.dir).toBe(nestedDir);
        
        const glob = new Bun.Glob("*");
        const files = await Array.fromAsync(glob.scan(nestedDir));
        expect(files.length).toBeGreaterThan(0);
    });

    it("should return correct source URL", async () => {
        const template = "python";
        const branch = "main";

        const result = await download(template, branch, testOutputDir);

        expect(result.source).toBe(
            "https://github.com/cartesi/application-templates",
        );
    });
});
