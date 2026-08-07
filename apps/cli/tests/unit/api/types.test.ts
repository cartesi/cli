import { describe, expect, it } from "bun:test";
import * as path from "node:path";
import { listrRenderer, resolveConfig } from "../../../src/api/types.js";
import { defaultConfig } from "../../../src/config.js";

const fixture = (...paths: string[]) =>
    path.join(__dirname, "..", "config", "fixtures", ...paths);

describe("api/types", () => {
    describe("resolveConfig", () => {
        it("should default to the default configuration", () => {
            // there is no cartesi.toml at the root of the repository
            expect(resolveConfig()).toEqual(defaultConfig());
        });

        it("should return a configuration object as is", () => {
            const config = defaultConfig();
            config.sdk = "my/sdk:1.0.0";
            expect(resolveConfig(config)).toBe(config);
        });

        it("should read a configuration file", () => {
            const config = resolveConfig(fixture("drives", "rives.toml"));
            expect(Object.keys(config.drives)).toEqual([
                "root",
                "doom",
                "tetrix",
            ]);
            expect(config.withdrawalConfig).toBeUndefined();
        });

        it("should merge a list of configuration files", () => {
            const config = resolveConfig([
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

        it("should fail for a configuration file that does not exist", () => {
            expect(() => resolveConfig("undefined.toml")).toThrow(
                "Config file undefined.toml does not exist",
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
