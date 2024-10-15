import { describe, expect, it } from "vitest";
import {
    defaultConfig,
    defaultMachineConfig,
    InvalidBooleanValueError,
    InvalidBuilderError,
    InvalidBytesValueError,
    InvalidDriveFormatError,
    InvalidEmptyDriveFormatError,
    InvalidNumberValueError,
    InvalidStringValueError,
    parse,
    RequiredFieldError,
} from "../src/config.js";

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
            new InvalidBuilderError("invalid"),
        );
        expect(() => parse("[drives.root]\nbuilder = true")).toThrowError(
            new InvalidBuilderError(true),
        );
        expect(() => parse("[drives.root]\nbuilder = 10")).toThrowError(
            new InvalidBuilderError(10),
        );
        expect(() => parse("[drives.root]\nbuilder = {}")).toThrowError(
            new InvalidBuilderError({}),
        );
    });

    it("invalid drive: invalid format", () => {
        expect(() => parse('[drives.root]\nformat = "invalid"')).toThrowError(
            new InvalidDriveFormatError("invalid"),
        );
        expect(() => parse("[drives.root]\nformat = true")).toThrowError(
            new InvalidDriveFormatError(true),
        );
        expect(() => parse("[drives.root]\nformat = 10")).toThrowError(
            new InvalidDriveFormatError(10),
        );
        expect(() => parse("[drives.root]\nformat = {}")).toThrowError(
            new InvalidDriveFormatError({}),
        );
    });

    it("invalid drive: invalid extension", () => {
        const builderNone = `
            [drives.none]
            builder = "none"
            filename = "./games/doom.xyzfs"
            mount = "/usr/local/games/doom"
        `;
        expect(() => parse(builderNone)).toThrowError(
            new InvalidDriveFormatError(".xyzfs"),
        );
    });

    it("invalid drive: invalid mount", () => {
        expect(() => parse("[drives.data]\nmount = 42")).toThrowError(
            new InvalidStringValueError(42),
        );
    });

    it("invalid empty drive: invalid fomat", () => {
        expect(() =>
            parse("[drives.data]\nbuilder = 'empty'\nformat = 42"),
        ).toThrowError(new InvalidEmptyDriveFormatError(42));
    });

    it("invalid boolean value", () => {
        expect(() => parse("[machine]\nno-rollup = 42")).toThrowError(
            new InvalidBooleanValueError(42),
        );
    });

    it("invalid number value", () => {
        expect(() => parse("[machine]\nmax-mcycle = 'abc'")).toThrowError(
            new InvalidNumberValueError("abc"),
        );
    });

    it("invalid string value", () => {
        const invalidTarDrive = `
            [drives.data]
            builder = "tar"
            filename = 42 # invalid
            format = "ext2"
        `;
        expect(() => parse(invalidTarDrive)).toThrowError(
            new InvalidStringValueError(42),
        );
    });

    it("invalid bytes value", () => {
        expect(() => parse("[machine]\nram-length = 'abc'")).toThrowError(
            new InvalidBytesValueError("abc"),
        );
    });

    it("invalid boolean", () => {
        expect(() =>
            parse("[machine]\nassert_rolling_update = 42"),
        ).toThrowError(new InvalidBooleanValueError(42));
    });

    it("required field", () => {
        const invalidDirectoryDrive = `
            [drives.data]
            builder = "directory"
            # directory = '' # required
        `;
        expect(() => parse(invalidDirectoryDrive)).toThrowError(
            new RequiredFieldError("directory"), //XXX: how to know which field was required
        );
    });

    it("machine-config", () => {
        const config = `
            [machine]
            no-rollup = true
        `;
        expect(parse(config)).toEqual({
            ...defaultConfig(),
            machine: {
                ...defaultMachineConfig(),
                noRollup: true,
            },
        });

        const invalidConfig = `
            ${config}
            bootargs = ["no4lvl", "quiet", false]
        `;
        expect(() => parse(invalidConfig)).toThrowError(
            new InvalidStringValueError(false),
        );
    });
});
