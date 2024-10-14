import { describe, expect, it } from "vitest";
import { defaultConfig, defaultMachineConfig, parse } from "../src/config.js";

describe("config", () => {
    it("default config", () => {
        const config = parse("");
        expect(config).toEqual(defaultConfig());
    });

    it("non-standard root drive", () => {
        const config = parse(`[drives.root]
builder = "docker"
dockerfile = "backend/Dockerfile"
shared = true`);

        expect(config).toEqual({
            ...defaultConfig(),
            drives: {
                root: {
                    builder: "docker",
                    dockerfile: "backend/Dockerfile",
                    context: ".",
                    extraSize: 0,
                    format: "ext2",
                    image: undefined,
                    mount: undefined,
                    tags: [],
                    target: undefined,
                    shared: true,
                    user: undefined,
                },
            },
        });
    });

    it("invalid drive", () => {
        expect(parse("drives = 42")).toEqual(defaultConfig());
        expect(parse("drives.root = true")).toEqual(defaultConfig());
        expect(parse("drives.root = 42")).toEqual(defaultConfig());
    });

    it("invalid drive: invalid builder", () => {
        expect(() => parse('[drives.root]\nbuilder = "invalid"')).toThrowError(
            "Invalid builder: invalid",
        );
        expect(() => parse("[drives.root]\nbuilder = true")).toThrowError(
            "Invalid builder: true",
        );
        expect(() => parse("[drives.root]\nbuilder = 10")).toThrowError(
            "Invalid builder: 10",
        );
        expect(() => parse("[drives.root]\nbuilder = {}")).toThrowError(
            "Invalid builder: [object Object]",
        );
    });

    it("invalid drive: invalid format", () => {
        expect(() => parse('[drives.root]\nformat = "invalid"')).toThrowError(
            "Invalid format: invalid",
        );
        expect(() => parse("[drives.root]\nformat = true")).toThrowError(
            "Invalid format: true",
        );
        expect(() => parse("[drives.root]\nformat = 10")).toThrowError(
            "Invalid format: 10",
        );
        expect(() => parse("[drives.root]\nformat = {}")).toThrowError(
            "Invalid format: [object Object]",
        );
    });

    it("invalid drive: invalid mount", () => {
        expect(() => parse("[drives.data]\nmount = 42")).toThrowError(
            "Invalid string value: 42",
        );
    });

    it("machine-config", () => {
        expect(parse("[machine]\nno-rollup = true")).toEqual({
            ...defaultConfig(),
            machine: {
                ...defaultMachineConfig(),
                noRollup: true,
            },
        });
    });
});
