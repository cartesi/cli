import { describe, expect, it } from "bun:test";
import * as path from "node:path";
import {
    CONFIG_FILES,
    ConfigFileNotFoundError,
    defaultConfig,
    findConfigFile,
    InvalidConfigExportError,
    loadConfig,
    loadConfigFile,
    UnsupportedConfigFormatError,
} from "../../../src/config/index.js";

const fixtures = path.join(__dirname, "fixtures");
const files = path.join(fixtures, "files");
const file = (name: string) => path.join(files, name);

const env = { command: "build", cwd: files, mode: "test" } as const;

describe("findConfigFile", () => {
    it("should find a configuration file by name", () => {
        expect(findConfigFile(path.join(fixtures, "project-yaml"))).toBe(
            path.join(fixtures, "project-yaml", "cartesi.config.yaml"),
        );
    });

    it("should find the deprecated configuration file", () => {
        expect(findConfigFile(path.join(fixtures, "project-legacy"))).toBe(
            path.join(fixtures, "project-legacy", "cartesi.toml"),
        );
    });

    it("should return undefined when the project has no configuration file", () => {
        expect(findConfigFile(path.join(fixtures, "project-none"))).toBe(
            undefined,
        );
    });

    it("should prefer the first of the supported names", () => {
        // the fixture directory has a file of every supported format
        expect(findConfigFile(files)).toBe(file(CONFIG_FILES[0]));
    });
});

describe("loadConfigFile", () => {
    it("should load a TypeScript configuration file", async () => {
        const config = await loadConfigFile(file("cartesi.config.ts"), env);
        expect(config).toEqual({
            drives: { data: { builder: "empty", size: "64Mb" } },
            machine: { entrypoint: "dapp", ramLength: "256Mi" },
            run: { epochLength: 10 },
            sdk: "my/sdk:1.0.0",
        });
    });

    it("should load a JavaScript configuration file", async () => {
        const config = await loadConfigFile(file("cartesi.config.js"), env);
        expect(config).toEqual({ machine: { ramLength: "512Mi" } });
    });

    it("should call a configuration file that exports a function", async () => {
        const config = await loadConfigFile(file("function.config.ts"), {
            command: "run",
            cwd: files,
            mode: "production",
        });
        expect(config).toEqual({
            machine: { entrypoint: "run:production" },
            run: { epochLength: 10 },
        });
    });

    it("should load a JSON configuration file", async () => {
        const config = await loadConfigFile(file("cartesi.config.json"), env);
        expect(config).toMatchObject({
            machine: { ramLength: "256Mi" },
            run: { epochLength: 10 },
        });
    });

    it("should load a YAML configuration file", async () => {
        const config = await loadConfigFile(file("cartesi.config.yaml"), env);
        expect(config).toEqual({
            drives: { data: { builder: "empty", size: "64Mb" } },
            machine: { ramLength: "256Mi" },
            run: { epochLength: 10, services: ["explorer"] },
        });
    });

    it("should read a file with no format in its name as YAML", async () => {
        expect(await loadConfigFile(file("bare.config"), env)).toEqual({
            machine: { ramLength: "256Mi" },
        });
    });

    it("should load an empty configuration file", async () => {
        expect(await loadConfigFile(file("empty.config"), env)).toEqual({});
    });

    it("should fail for a module without a default export", async () => {
        expect(loadConfigFile(file("invalid.config.ts"), env)).rejects.toThrow(
            new InvalidConfigExportError(file("invalid.config.ts")),
        );
    });

    it("should fail for an unsupported format", async () => {
        expect(loadConfigFile(file("unsupported.ini"), env)).rejects.toThrow(
            new UnsupportedConfigFormatError(file("unsupported.ini")),
        );
    });
});

describe("loadConfig", () => {
    it("should use the defaults when the project has no configuration file", async () => {
        const config = await loadConfig({
            cwd: path.join(fixtures, "project-none"),
        });
        expect(config).toEqual(defaultConfig());
    });

    it("should find and resolve the configuration file of the project", async () => {
        const config = await loadConfig({
            cwd: path.join(fixtures, "project-yaml"),
        });
        expect(config.machine.ramLength).toBe("256Mi");
        expect(config.run.epochLength).toBe(10);
    });

    it("should still read the deprecated configuration file", async () => {
        const config = await loadConfig({
            cwd: path.join(fixtures, "project-legacy"),
        });
        expect(config.machine.ramLength).toBe("256Mi");
    });

    it("should resolve and validate an explicit configuration file", async () => {
        const config = await loadConfig({
            cwd: files,
            files: ["cartesi.config.ts"],
        });
        expect(config.sdk).toBe("my/sdk:1.0.0");
        expect(config.machine.ramLength).toBe("256Mi");
        expect(config.run.epochLength).toBe(10);
        // sizes written as strings are resolved to a number of bytes
        expect(config.drives.data).toMatchObject({ size: 64 * 1024 * 1024 });
        // a root drive is always present
        expect(config.drives.root).toMatchObject({ builder: "docker" });
    });

    it("should merge a list of configuration files, in order", async () => {
        const config = await loadConfig({
            cwd: files,
            files: ["cartesi.config.ts", "override.yaml"],
        });
        expect(config.machine.entrypoint).toBe("overridden");
        // untouched by the override
        expect(config.machine.ramLength).toBe("256Mi");
        expect(config.run.epochLength).toBe(20);
    });

    it("should give the command and the mode to a configuration file", async () => {
        const config = await loadConfig({
            command: "run",
            cwd: files,
            files: ["function.config.ts"],
            mode: "production",
        });
        expect(config.machine.entrypoint).toBe("run:production");
    });

    it("should fail for a configuration file that does not exist", async () => {
        expect(
            loadConfig({ cwd: files, files: ["missing.config.ts"] }),
        ).rejects.toThrow(
            new ConfigFileNotFoundError(file("missing.config.ts")),
        );
    });
});
