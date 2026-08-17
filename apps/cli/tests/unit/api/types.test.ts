import { describe, expect, it } from "bun:test";
import * as path from "node:path";
import { listrRenderer, resolveConfig } from "../../../src/api/types.js";
import { defaultConfig } from "../../../src/config/index.js";

const fixture = (...paths: string[]) =>
    path.join(__dirname, "..", "config", "fixtures", ...paths);

describe("api/types", () => {
    describe("resolveConfig", () => {
        it("should default to the default configuration", async () => {
            // there is no configuration file at the root of the repository
            expect(await resolveConfig()).toEqual(defaultConfig());
        });

        it("should normalize a configuration given inline", async () => {
            const config = await resolveConfig({ sdk: "my/sdk:1.0.0" });
            expect(config).toEqual({
                ...defaultConfig(),
                sdk: "my/sdk:1.0.0",
            });
        });

        it("should accept an already resolved configuration", async () => {
            const config = defaultConfig();
            config.sdk = "my/sdk:1.0.0";
            expect(await resolveConfig(config)).toEqual(config);
        });

        it("should read a configuration file", async () => {
            const config = await resolveConfig(fixture("drives", "rives.toml"));
            expect(Object.keys(config.drives)).toEqual([
                "root",
                "doom",
                "tetrix",
            ]);
            expect(config.withdrawalConfig).toBeUndefined();
        });

        it("should merge a list of configuration files", async () => {
            const config = await resolveConfig([
                fixture("drives", "rives.toml"),
                fixture("withdrawal", "config.toml"),
            ]);
            expect(Object.keys(config.drives)).toEqual([
                "root",
                "doom",
                "tetrix",
            ]);
            expect(config.withdrawalConfig?.guardian).toBe(
                "0x1111111111111111111111111111111111111111",
            );
        });

        it("should fail for a configuration file that does not exist", async () => {
            expect(resolveConfig("undefined.toml")).rejects.toThrow(
                "does not exist",
            );
        });
    });

    describe("listrRenderer", () => {
        it("should be silent by default", () => {
            expect(listrRenderer()).toBe("silent");
            expect(listrRenderer("silent")).toBe("silent");
            expect(listrRenderer("default")).toBe("default");
            expect(listrRenderer("verbose")).toBe("verbose");
        });
    });
});
