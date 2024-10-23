import * as fs from "fs";
import * as path from "path";
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
} from "../../src/config.js";

const loadDriveConfig = (driveName: string) => {
    const filePath = path.join(
        __dirname,
        "config",
        "fixtures",
        "drives",
        `${driveName}.toml`,
    );
    return fs.readFileSync(filePath, "utf-8");
};

describe("when parsing only drive config files", () => {
    it("should pass with a basic drive config", () => {
        const basic = loadDriveConfig("basic");
        expect(() => parse(basic)).not.toThrow();
    });

    it("should pass with a data drive config", () => {
        const basic = loadDriveConfig("data");
        expect(() => parse(basic)).not.toThrow();
    });

    it("should pass with an empty drive config", () => {
        const basic = loadDriveConfig("empty");
        expect(() => parse(basic)).not.toThrow();
    });

    it("should pass with a none drive config", () => {
        const basic = loadDriveConfig("none");
        expect(() => parse(basic)).not.toThrow();
    });

    it("should pass with a rives config", () => {
        const basic = loadDriveConfig("rives");
        expect(() => parse(basic)).not.toThrow();
    });

    it("should pass with a tar drive config", () => {
        const basic = loadDriveConfig("rives");
        expect(() => parse(basic)).not.toThrow();
    });
});

describe("when parsing a cartesi.toml config", () => {
    it("should load the default config when file is empty", () => {
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

    /**
     * [machine]
     */
    describe("when parsing [machine]", () => {
        const config = `
                [machine]
                no-rollup = true
            `;
        it("machine-config", () => {
            expect(parse(config)).toEqual({
                ...defaultConfig(),
                machine: {
                    ...defaultMachineConfig(),
                    noRollup: true,
                },
            });
        });
        it("should fail for invalid bootargs", () => {
            const invalidConfig = `
                ${config}
                bootargs = ["no4lvl", "quiet", false]
            `;
            expect(() => parse(invalidConfig)).toThrowError(
                new InvalidStringValueError(false),
            );
        });
    });

    /**
     * [drives]
     */
    describe("when parsing [drives]", () => {
        it("should fail for invalid configuration", () => {
            expect(parse("drives = 42")).toEqual(defaultConfig());
            expect(parse("drives.root = true")).toEqual(defaultConfig());
            expect(parse("drives.root = 42")).toEqual(defaultConfig());
        });

        it("should fail for invalid builder", () => {
            expect(() =>
                parse('[drives.root]\nbuilder = "invalid"'),
            ).toThrowError(new InvalidBuilderError("invalid"));
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

        it("should fail for invalid format", () => {
            expect(() =>
                parse('[drives.root]\nformat = "invalid"'),
            ).toThrowError(new InvalidDriveFormatError("invalid"));
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

        it("should fail for invalid filename extension", () => {
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

        it("should fail for invalid mount", () => {
            expect(() => parse("[drives.data]\nmount = 42")).toThrowError(
                new InvalidStringValueError(42),
            );
        });

        it("should fail for invalid empty drive format", () => {
            expect(() =>
                parse("[drives.data]\nbuilder = 'empty'\nformat = 42"),
            ).toThrowError(new InvalidEmptyDriveFormatError(42));
        });
    });

    /**
     * field types
     */
    describe("when parsing fields types", () => {
        it("should fail for invalid boolean value", () => {
            expect(() => parse("[machine]\nno-rollup = 42")).toThrowError(
                new InvalidBooleanValueError(42),
            );
        });

        it("should fail for invalid number value", () => {
            expect(() => parse("[machine]\nmax-mcycle = 'abc'")).toThrowError(
                new InvalidNumberValueError("abc"),
            );
        });

        it("should fail for invalid string value", () => {
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

        it("should fail for invalid bytes value", () => {
            const invalidTarDrive = `
                [drives.data]
                builder = "tar"
                extraSize = "abc"
                filename = "data.tar"
                format = "ext2"
            `;
            expect(() => parse(invalidTarDrive)).toThrowError(
                new InvalidBytesValueError("abc"),
            );
        });

        it("should pass for valid bytes value", () => {
            // nukmber
            expect(() =>
                parse(
                    `[drives.data]
                    builder = "directory"
                    directory = "/data"
                    extra-size = 128
                    `,
                ),
            ).not.toThrow();
            // string
            expect(() =>
                parse(
                    `[drives.data]
                    builder = "directory"
                    directory = "/data"
                    extra-size = "128MB"
                    `,
                ),
            ).not.toThrow();
            // bigint
            const bigInt = BigInt(128);
            expect(() =>
                parse(
                    `[drives.data]
                    builder = "directory"
                    directory = "/data"
                    extra-size = ${bigInt}
                    `,
                ),
            ).not.toThrow();
        });

        it("should fail for invalid boolean value", () => {
            expect(() => parse("[machine]\nfinal-hash = 42")).toThrowError(
                new InvalidBooleanValueError(42),
            );
        });

        it("should fail for invalid optional boolean value", () => {
            expect(() =>
                parse("[machine]\nassert-rolling-template = 42"),
            ).toThrowError(new InvalidBooleanValueError(42));
        });

        it("should fail when required field is not defined", () => {
            const invalidDirectoryDrive = `
                [drives.data]
                builder = "directory"
                # directory = '' # required
            `;
            expect(() => parse(invalidDirectoryDrive)).toThrowError(
                new RequiredFieldError("directory"), //XXX: how to know which field was required
            );
        });
    });
});
