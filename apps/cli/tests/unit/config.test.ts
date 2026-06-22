import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
    defaultConfig,
    defaultMachineConfig,
    InvalidAddressValueError,
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
    return [fs.readFileSync(filePath, "utf-8")];
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
