import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
    defaultConfig,
    defaultMachineConfig,
    DuplicateLabelError,
    InvalidAddressValueError,
    InvalidBooleanValueError,
    InvalidBuilderError,
    InvalidBytesValueError,
    InvalidDriveFormatError,
    InvalidEmptyDriveFormatError,
    InvalidEnvError,
    InvalidNumberValueError,
    InvalidNvramSizeError,
    InvalidStringValueError,
    MissingNvramSourceError,
    parse,
    RequiredFieldError,
    TooManyNvramsError,
} from "../../src/config.js";

const loadFixture = (...segments: string[]) => {
    const filePath = path.join(__dirname, "config", "fixtures", ...segments);
    return [fs.readFileSync(filePath, "utf-8")];
};

const loadDriveConfig = (driveName: string) =>
    loadFixture("drives", `${driveName}.toml`);

const loadNvramConfig = (nvramName: string) =>
    loadFixture("nvrams", `${nvramName}.toml`);

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

describe("when parsing only nvram config files", () => {
    it.each([
        "pristine",
        "shared",
        "file",
        "multi",
    ])("should pass with a %s nvram config", (name) => {
        expect(() => parse(loadNvramConfig(name))).not.toThrow();
    });
});

describe("when parsing a cartesi.toml config", () => {
    it("should load the default config when file is empty", () => {
        const config = parse([""]);
        expect(config).toEqual(defaultConfig());
    });

    it("non-standard root drive", () => {
        const config = parse([
            `[drives.root]
builder = "docker"
dockerfile = "backend/Dockerfile"
shared = true`,
        ]);

        expect(config).toEqual({
            ...defaultConfig(),
            drives: {
                root: {
                    buildArgs: [],
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
                use_docker_env = true
            `;
        it("machine-config", () => {
            expect(parse([config])).toEqual({
                ...defaultConfig(),
                machine: {
                    ...defaultMachineConfig(),
                    useDockerEnv: true,
                },
            });
        });
        it("should fail for invalid bootargs", () => {
            const invalidConfig = `
                ${config}
                boot_args = ["no4lvl", "quiet", false]
            `;
            expect(() => parse([invalidConfig])).toThrowError(
                new InvalidStringValueError(false),
            );
        });
        it("should parse entrypoint", () => {
            const entrypointConfig = `
                ${config}
                entrypoint = "echo 'Hello, World!'"
            `;
            expect(parse([entrypointConfig])).toEqual({
                ...defaultConfig(),
                machine: {
                    ...defaultMachineConfig(),
                    useDockerEnv: true,
                    entrypoint: "echo 'Hello, World!'",
                },
            });
        });

        it("should parse env_file", () => {
            const envFileConfig = `
                [machine]
                env_file = ".env"
            `;
            expect(parse([envFileConfig])).toEqual({
                ...defaultConfig(),
                machine: {
                    ...defaultMachineConfig(),
                    envFile: ".env",
                },
            });
        });

        it("should fail for invalid env_file", () => {
            expect(() => parse(["[machine]\nenv_file = 42"])).toThrowError(
                new InvalidStringValueError(42),
            );
        });

        it("should parse an env table", () => {
            const envConfig = `
                [machine.env]
                FOO = "bar"
                LOG_LEVEL = "debug"
            `;
            expect(parse([envConfig])).toEqual({
                ...defaultConfig(),
                machine: {
                    ...defaultMachineConfig(),
                    env: { FOO: "bar", LOG_LEVEL: "debug" },
                },
            });
        });

        it("should parse an inline env table", () => {
            const envConfig = `
                [machine]
                env = { FOO = "bar" }
            `;
            expect(parse([envConfig])).toEqual({
                ...defaultConfig(),
                machine: {
                    ...defaultMachineConfig(),
                    env: { FOO: "bar" },
                },
            });
        });

        it("should coerce non-string scalar env values to string", () => {
            const envConfig = `
                [machine.env]
                PORT = 8080
                ENABLED = true
            `;
            expect(parse([envConfig])).toEqual({
                ...defaultConfig(),
                machine: {
                    ...defaultMachineConfig(),
                    env: { PORT: "8080", ENABLED: "true" },
                },
            });
        });

        it("should fail for an env that is not a table", () => {
            expect(() => parse(["[machine]\nenv = 42"])).toThrowError(
                new InvalidEnvError(42),
            );
        });

        it("should fail for an env value that is an array", () => {
            const envConfig = `
                [machine.env]
                FOO = ["bar"]
            `;
            expect(() => parse([envConfig])).toThrowError(
                new InvalidStringValueError(["bar"]),
            );
        });
    });

    /**
     * [withdrawal]
     */
    describe("when parsing [withdrawal.config]", () => {
        it("should parse a valid withdrawal config", () => {
            const config = `
                [withdrawal.config]
                guardian = "0x1111111111111111111111111111111111111111" 
                log2_leaves_per_account = 0
                log2_max_num_of_accounts = 20
                accounts_drive_start_index = 33554432
                withdrawal_output_builder = "0x2222222222222222222222222222222222222222"
            `;
            expect(parse([config])).toEqual({
                ...defaultConfig(),
                withdrawalConfig: {
                    guardian: "0x1111111111111111111111111111111111111111",
                    log2_leaves_per_account: 0,
                    log2_max_num_of_accounts: 20,
                    accounts_drive_start_index: 33554432,
                    withdrawal_output_builder:
                        "0x2222222222222222222222222222222222222222",
                },
            });
        });

        it("should parse a valid withdrawal config that uses hex instead of decimal for numbers", () => {
            const config = `
                [withdrawal.config]
                guardian = "0x1111111111111111111111111111111111111111" 
                log2_leaves_per_account = 0x0
                log2_max_num_of_accounts = 0x14
                accounts_drive_start_index = 0x2000000
                withdrawal_output_builder = "0x2222222222222222222222222222222222222222"
            `;
            expect(parse([config])).toEqual({
                ...defaultConfig(),
                withdrawalConfig: {
                    guardian: "0x1111111111111111111111111111111111111111",
                    log2_leaves_per_account: 0,
                    log2_max_num_of_accounts: 20,
                    accounts_drive_start_index: 33554432,
                    withdrawal_output_builder:
                        "0x2222222222222222222222222222222222222222",
                },
            });
        });

        it("should parse a valid withdrawal config even when using quoted hex for the numbers", () => {
            const config = `
                [withdrawal.config]
                guardian = "0x1111111111111111111111111111111111111111" 
                log2_leaves_per_account = "0x0"
                log2_max_num_of_accounts = "0x14"
                accounts_drive_start_index = "0x2000000"
                withdrawal_output_builder = "0x2222222222222222222222222222222222222222"
            `;

            expect(parse([config])).toEqual({
                ...defaultConfig(),
                withdrawalConfig: {
                    guardian: "0x1111111111111111111111111111111111111111",
                    log2_leaves_per_account: 0,
                    log2_max_num_of_accounts: 20,
                    accounts_drive_start_index: 33554432,
                    withdrawal_output_builder:
                        "0x2222222222222222222222222222222222222222",
                },
            });
        });

        it("should return undefined when [withdrawal.config] is not defined", () => {
            const config = ``;
            expect(parse([config])).toEqual({
                ...defaultConfig(),
                withdrawalConfig: undefined,
            });
        });

        it("should return undefined when [withdrawal.config] is empty", () => {
            const config = `
                [withdrawal.config]
            `;

            expect(parse([config])).toEqual({
                ...defaultConfig(),
                withdrawalConfig: undefined,
            });
        });

        it("should fail when missing guardian field", () => {
            const config = `
                [withdrawal.config]
                log2_leaves_per_account = 0
                log2_max_num_of_accounts = 20
                accounts_drive_start_index = 33554432
                withdrawal_output_builder = "0x2222222222222222222222222222222222222222"
            `;
            expect(() => parse([config])).toThrowError(
                new RequiredFieldError("guardian"),
            );
        });

        it("should fail when missing withdrawal_output_builder field", () => {
            const config = `
                [withdrawal.config]
                guardian = "0x1111111111111111111111111111111111111111" 
                log2_leaves_per_account = 0
                log2_max_num_of_accounts = 20
                accounts_drive_start_index = 33554432
            `;
            expect(() => parse([config])).toThrowError(
                new RequiredFieldError("withdrawal_output_builder"),
            );
        });

        it("should fail when missing log2_leaves_per_account field", () => {
            const config = `
                [withdrawal.config]
                guardian = "0x1111111111111111111111111111111111111111" 
                log2_max_num_of_accounts = 20
                accounts_drive_start_index = 33554432
                withdrawal_output_builder = "0x2222222222222222222222222222222222222222"
            `;
            expect(() => parse([config])).toThrowError(
                new RequiredFieldError("log2_leaves_per_account"),
            );
        });

        it("should fail when missing log2_max_num_of_accounts field", () => {
            const config = `
                [withdrawal.config]
                guardian = "0x1111111111111111111111111111111111111111" 
                log2_leaves_per_account = 0
                accounts_drive_start_index = 33554432
                withdrawal_output_builder = "0x2222222222222222222222222222222222222222222"
            `;
            expect(() => parse([config])).toThrowError(
                new RequiredFieldError("log2_max_num_of_accounts"),
            );
        });

        it("should fail when missing accounts_drive_start_index field", () => {
            const config = `
                [withdrawal.config]
                guardian = "0x1111111111111111111111111111111111111111" 
                log2_leaves_per_account = 0
                log2_max_num_of_accounts = 20
                withdrawal_output_builder = "0x2222222222222222222222222222222222222222"
            `;
            expect(() => parse([config])).toThrowError(
                new RequiredFieldError("accounts_drive_start_index"),
            );
        });

        it("should fail when guardian is not a valid address", () => {
            const config = `
                [withdrawal.config]
                guardian = "invalid_address" 
                log2_leaves_per_account = 0
                log2_max_num_of_accounts = 20
                accounts_drive_start_index = 33554432
                withdrawal_output_builder = "0x2222222222222222222222222222222222222222"
            `;
            expect(() => parse([config])).toThrowError(
                new InvalidAddressValueError("invalid_address", "guardian"),
            );
        });

        it("should fail when withdrawal_output_builder is not a valid address", () => {
            const config = `
                [withdrawal.config]
                guardian = "0x1111111111111111111111111111111111111111" 
                log2_leaves_per_account = 0
                log2_max_num_of_accounts = 20
                accounts_drive_start_index = 33554432
                withdrawal_output_builder = "invalid_address"
            `;
            expect(() => parse([config])).toThrowError(
                new InvalidAddressValueError(
                    "invalid_address",
                    "withdrawal_output_builder",
                ),
            );
        });

        it("should fail when log2_leaves_per_account is not a number", () => {
            const config = `
                [withdrawal.config]
                guardian = "0x1111111111111111111111111111111111111111" 
                log2_leaves_per_account = "not_a_number"
                log2_max_num_of_accounts = 20
                accounts_drive_start_index = 33554432
                withdrawal_output_builder = "0x2222222222222222222222222222222222222222"
            `;
            expect(() => parse([config])).toThrowError(
                new InvalidNumberValueError(
                    "not_a_number",
                    "log2_leaves_per_account",
                ),
            );
        });

        it("should fail when log2_max_num_of_accounts is not a number", () => {
            const config = `
                [withdrawal.config]
                guardian = "0x1111111111111111111111111111111111111111" 
                log2_leaves_per_account = 0
                log2_max_num_of_accounts = "not_a_number"
                accounts_drive_start_index = 33554432
                withdrawal_output_builder = "0x2222222222222222222222222222222222222222"
            `;
            expect(() => parse([config])).toThrowError(
                new InvalidNumberValueError(
                    "not_a_number",
                    "log2_max_num_of_accounts",
                ),
            );
        });

        it("should fail when accounts_drive_start_index is not a number", () => {
            const config = `
                [withdrawal.config]
                guardian = "0x1111111111111111111111111111111111111111" 
                log2_leaves_per_account = 0
                log2_max_num_of_accounts = 20
                accounts_drive_start_index = "not_a_number"
                withdrawal_output_builder = "0x2222222222222222222222222222222222222222"
            `;
            expect(() => parse([config])).toThrowError(
                new InvalidNumberValueError(
                    "not_a_number",
                    "accounts_drive_start_index",
                ),
            );
        });
    });

    /**
     * [drives]
     */
    describe("when parsing [drives]", () => {
        it("should fail for invalid configuration", () => {
            expect(parse(["drives = 42"])).toEqual(defaultConfig());
            expect(parse(["drives.root = true"])).toEqual(defaultConfig());
            expect(parse(["drives.root = 42"])).toEqual(defaultConfig());
        });

        it("should fail for invalid builder", () => {
            expect(() =>
                parse(['[drives.root]\nbuilder = "invalid"']),
            ).toThrowError(new InvalidBuilderError("invalid"));
            expect(() => parse(["[drives.root]\nbuilder = true"])).toThrowError(
                new InvalidBuilderError(true),
            );
            expect(() => parse(["[drives.root]\nbuilder = 10"])).toThrowError(
                new InvalidBuilderError(10),
            );
            expect(() => parse(["[drives.root]\nbuilder = {}"])).toThrowError(
                new InvalidBuilderError({}),
            );
        });

        it("should fail for invalid format", () => {
            expect(() =>
                parse(['[drives.root]\nformat = "invalid"']),
            ).toThrowError(new InvalidDriveFormatError("invalid"));
            expect(() => parse(["[drives.root]\nformat = true"])).toThrowError(
                new InvalidDriveFormatError(true),
            );
            expect(() => parse(["[drives.root]\nformat = 10"])).toThrowError(
                new InvalidDriveFormatError(10),
            );
            expect(() => parse(["[drives.root]\nformat = {}"])).toThrowError(
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
            expect(() => parse([builderNone])).toThrowError(
                new InvalidDriveFormatError(".xyzfs"),
            );
        });

        it("should fail for invalid mount", () => {
            expect(() => parse(["[drives.data]\nmount = 42"])).toThrowError(
                new InvalidStringValueError(42),
            );
        });

        it("should fail for invalid empty drive format", () => {
            expect(() =>
                parse(["[drives.data]\nbuilder = 'empty'\nformat = 42"]),
            ).toThrowError(new InvalidEmptyDriveFormatError(42));
        });
    });

    /**
     * [nvrams]
     */
    describe("when parsing [nvrams]", () => {
        it("should default to no nvrams", () => {
            expect(parse([""]).nvrams).toEqual({});
        });

        it("should parse a pristine nvram", () => {
            expect(parse(['[nvrams.input]\nsize = "4Ki"'])).toEqual({
                ...defaultConfig(),
                nvrams: {
                    input: {
                        filename: undefined,
                        size: 4096,
                        shared: undefined,
                        user: undefined,
                    },
                },
            });
        });

        it("should parse an nvram backed by an existing image", () => {
            expect(parse(['[nvrams.seed]\nfilename = "./seed.raw"'])).toEqual({
                ...defaultConfig(),
                nvrams: {
                    seed: {
                        filename: "./seed.raw",
                        size: undefined,
                        shared: undefined,
                        user: undefined,
                    },
                },
            });
        });

        it("should parse a shared nvram", () => {
            const config = `
                [nvrams.output]
                size = "4Ki"
                shared = true
                user = "dapp"
            `;
            expect(parse([config])).toEqual({
                ...defaultConfig(),
                nvrams: {
                    output: {
                        filename: undefined,
                        size: 4096,
                        shared: true,
                        user: "dapp",
                    },
                },
            });
        });

        it("should preserve the order of the nvrams", () => {
            const config = `
                [nvrams.output]
                size = "4Ki"

                [nvrams.input]
                size = "4Ki"
            `;
            expect(Object.keys(parse([config]).nvrams)).toEqual([
                "output",
                "input",
            ]);
        });

        it.each([
            ["4096", 4096],
            ['"4096"', 4096],
            ['"4Ki"', 4096],
            ['"4KiB"', 4096],
            ['"4kb"', 4096],
            ['"1Mi"', 1048576],
            ['"1Mb"', 1048576],
        ])("should parse size %s as %i bytes", (size, expected) => {
            expect(
                parse([`[nvrams.input]\nsize = ${size}`]).nvrams.input.size,
            ).toEqual(expected);
        });

        it("should fail when neither size nor filename is defined", () => {
            expect(() => parse(["[nvrams.input]"])).toThrowError(
                new MissingNvramSourceError("input"),
            );
            expect(() => parse(["[nvrams.input]\nshared = true"])).toThrowError(
                new MissingNvramSourceError("input"),
            );
        });

        it("should fail for a size that is not a multiple of 4Ki", () => {
            expect(() => parse(['[nvrams.input]\nsize = "5Ki"'])).toThrowError(
                new InvalidNvramSizeError("input", 5120),
            );
            expect(() => parse(["[nvrams.input]\nsize = 0"])).toThrowError(
                new InvalidNvramSizeError("input", 0),
            );
        });

        it("should fail for an unparseable size", () => {
            expect(() => parse(['[nvrams.input]\nsize = "abc"'])).toThrowError(
                new InvalidBytesValueError("abc"),
            );
            expect(() => parse(["[nvrams.input]\nsize = true"])).toThrowError(
                new InvalidBytesValueError(true),
            );
        });

        it("should fail for more than 8 nvrams", () => {
            const config = Array.from(
                { length: 9 },
                (_, i) => `[nvrams.n${i}]\nsize = "4Ki"`,
            ).join("\n");
            expect(() => parse([config])).toThrowError(
                new TooManyNvramsError(9),
            );
        });

        it("should fail when a label is used by both a drive and an nvram", () => {
            const config = `
                [drives.data]
                builder = "empty"
                size = "100Mb"

                [nvrams.data]
                size = "4Ki"
            `;
            expect(() => parse([config])).toThrowError(
                new DuplicateLabelError("data"),
            );
        });

        it("should fail for the root label, which is always a drive", () => {
            expect(() => parse(['[nvrams.root]\nsize = "4Ki"'])).toThrowError(
                new DuplicateLabelError("root"),
            );
        });

        it("should fail for invalid shared and user values", () => {
            expect(() =>
                parse(['[nvrams.input]\nsize = "4Ki"\nshared = 42']),
            ).toThrowError(new InvalidBooleanValueError(42));
            expect(() =>
                parse(['[nvrams.input]\nsize = "4Ki"\nuser = 42']),
            ).toThrowError(new InvalidStringValueError(42));
        });
    });

    /**
     * field types
     */
    describe("when parsing fields types", () => {
        it("should fail for invalid boolean value", () => {
            expect(() =>
                parse(["[machine]\nuse_docker_env = 42"]),
            ).toThrowError(new InvalidBooleanValueError(42));
        });

        it("should fail for invalid number value", () => {
            expect(() => parse(["[machine]\nmax_mcycle = 'abc'"])).toThrowError(
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
            expect(() => parse([invalidTarDrive])).toThrowError(
                new InvalidStringValueError(42),
            );
        });

        it("should fail for invalid bytes value", () => {
            const invalidTarDrive = `
                [drives.data]
                builder = "tar"
                extra_size = "abc"
                filename = "data.tar"
                format = "ext2"
            `;
            expect(() => parse([invalidTarDrive])).toThrowError(
                new InvalidBytesValueError("abc"),
            );
        });

        it("should pass for valid bytes value", () => {
            // nukmber
            expect(() =>
                parse([
                    `[drives.data]
                    builder = "directory"
                    directory = "/data"
                    extra_size = 128
                    `,
                ]),
            ).not.toThrow();
            // string
            expect(() =>
                parse([
                    `[drives.data]
                    builder = "directory"
                    directory = "/data"
                    extra_size = "128MB"
                    `,
                ]),
            ).not.toThrow();
            // bigint
            const bigInt = BigInt(128);
            expect(() =>
                parse([
                    `[drives.data]
                    builder = "directory"
                    directory = "/data"
                    extra_size = ${bigInt}
                    `,
                ]),
            ).not.toThrow();
        });

        it("should fail for invalid optional boolean value", () => {
            expect(() =>
                parse(["[machine]\nassert_rolling_template = 42"]),
            ).toThrowError(new InvalidBooleanValueError(42));
        });

        it("should fail when required field is not defined", () => {
            const invalidDirectoryDrive = `
                [drives.data]
                builder = "directory"
                # directory = '' # required
            `;
            expect(() => parse([invalidDirectoryDrive])).toThrowError(
                new RequiredFieldError("directory"), //XXX: how to know which field was required
            );
        });
    });
});
