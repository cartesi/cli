import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
    defaultConfig,
    defaultMachineConfig,
    DuplicateLabelError,
    getAccountsDrive,
    InvalidAccountsDriveError,
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
    InvalidWithdrawalConfigError,
    MissingNvramSourceError,
    MultipleAccountsDrivesError,
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
    it.each(["pristine", "shared", "file", "multi"])(
        "should pass with a %s nvram config",
        (name) => {
            expect(() => parse(loadNvramConfig(name))).not.toThrow();
        },
    );
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
        const accountsDrive = `
            [drives.accounts]
            builder = "empty"
            format = "raw"
            size = "4MB"
            accounts_drive = true
        `;
        const withdrawal = (config: string) =>
            parse([accountsDrive, config]).withdrawalConfig;

        it("should parse a complete withdrawal config", () => {
            const config = `
                [withdrawal.config]
                guardian = "0x1111111111111111111111111111111111111111"
                log2_leaves_per_account = 0
                log2_max_num_of_accounts = 20
                accounts_drive_start_index = 33554432
                withdrawal_output_builder = "0x2222222222222222222222222222222222222222"
            `;
            expect(withdrawal(config)).toEqual({
                guardian: "0x1111111111111111111111111111111111111111",
                log2_leaves_per_account: 0,
                log2_max_num_of_accounts: 20,
                accounts_drive_start_index: 33554432n,
                withdrawal_output_builder:
                    "0x2222222222222222222222222222222222222222",
            });
        });

        it("should parse a withdrawal config that uses hex instead of decimal for numbers", () => {
            const config = `
                [withdrawal.config]
                log2_leaves_per_account = 0x0
                log2_max_num_of_accounts = 0x14
                accounts_drive_start_index = 0x2000000
            `;
            expect(withdrawal(config)).toEqual({
                log2_leaves_per_account: 0,
                log2_max_num_of_accounts: 20,
                accounts_drive_start_index: 33554432n,
            });
        });

        it("should parse a withdrawal config even when using quoted hex for the numbers", () => {
            const config = `
                [withdrawal.config]
                log2_leaves_per_account = "0x0"
                log2_max_num_of_accounts = "0x14"
                accounts_drive_start_index = "0x2000000"
            `;
            expect(withdrawal(config)).toEqual({
                log2_leaves_per_account: 0,
                log2_max_num_of_accounts: 20,
                accounts_drive_start_index: 33554432n,
            });
        });

        it.each([
            ["a bare integer", "9007199254740993"],
            ["a quoted decimal", '"9007199254740993"'],
            ["a quoted hex", '"0x20000000000001"'],
        ])(
            "should keep every digit of an accounts_drive_start_index beyond 2^53 given as %s",
            (_, value) => {
                const config = `
                [withdrawal.config]
                accounts_drive_start_index = ${value}
            `;
                expect(withdrawal(config)?.accounts_drive_start_index).toBe(
                    2n ** 53n + 1n,
                );
            },
        );

        it("should accept an empty section", () => {
            expect(withdrawal("[withdrawal.config]")).toEqual({});
        });

        it("should keep only the addresses when the layout is left to be derived", () => {
            const config = `
                [withdrawal.config]
                guardian = "0x1111111111111111111111111111111111111111"
                withdrawal_output_builder = "0x2222222222222222222222222222222222222222"
            `;
            expect(withdrawal(config)).toEqual({
                guardian: "0x1111111111111111111111111111111111111111",
                withdrawal_output_builder:
                    "0x2222222222222222222222222222222222222222",
            });
        });

        it("should return undefined when [withdrawal.config] is not defined", () => {
            expect(parse([""])).toEqual({
                ...defaultConfig(),
                withdrawalConfig: undefined,
            });
        });

        it("should fail for an unknown key", () => {
            expect(() =>
                withdrawal("[withdrawal.config]\nguardain = '0x1'"),
            ).toThrowError(
                new InvalidWithdrawalConfigError(
                    "unknown key 'guardain', expected one of guardian, log2_leaves_per_account, log2_max_num_of_accounts, accounts_drive_start_index, withdrawal_output_builder",
                ),
            );
        });

        it("should fail when the section is not a table", () => {
            expect(() => withdrawal("[withdrawal]\nconfig = 42")).toThrowError(
                new InvalidWithdrawalConfigError("expected a table, got 42"),
            );
        });

        it.each([
            ["guardian", '"invalid_address"', InvalidAddressValueError],
            [
                "withdrawal_output_builder",
                '"invalid_address"',
                InvalidAddressValueError,
            ],
        ])(
            "should fail when %s is not a valid address",
            (key, value, error) => {
                expect(() =>
                    withdrawal(`[withdrawal.config]\n${key} = ${value}`),
                ).toThrowError(new error("invalid_address", key));
            },
        );

        it.each([
            ["log2_leaves_per_account", '"not_a_number"', "not_a_number"],
            ["log2_leaves_per_account", "-1", -1],
            ["log2_leaves_per_account", "1.5", 1.5],
            ["log2_max_num_of_accounts", '"not_a_number"', "not_a_number"],
            ["accounts_drive_start_index", '"not_a_number"', "not_a_number"],
            ["accounts_drive_start_index", "-1", -1],
        ])("should fail when %s is %s", (key, value, parsed) => {
            expect(() =>
                withdrawal(`[withdrawal.config]\n${key} = ${value}`),
            ).toThrowError(new InvalidNumberValueError(parsed, key));
        });
    });

    /**
     * accounts drive validation, before the machine is built
     */
    describe("when checking the accounts drive", () => {
        const check = (config: string) => () => parse([config]);

        it("should fail when [withdrawal.config] has no accounts drive", () => {
            expect(() => parse(["[withdrawal.config]"])).toThrowError(
                new InvalidWithdrawalConfigError(
                    "emergency withdrawal needs an accounts drive, mark a raw drive or an nvram with accounts_drive = true",
                ),
            );
        });

        it("should turn emergency withdrawal on with only a marked drive", () => {
            const config = parse([
                '[nvrams.accounts]\nsize = "4Mi"\naccounts_drive = true',
            ]);
            expect(getAccountsDrive(config)).toMatchObject({
                kind: "nvram",
                label: "accounts",
            });
            expect(config.withdrawalConfig).toBeUndefined();
        });

        it("should fail when more than one drive is marked", () => {
            expect(
                check(`
                    [drives.a]
                    builder = "empty"
                    format = "raw"
                    size = "4MB"
                    accounts_drive = true

                    [nvrams.b]
                    size = "4Mi"
                    accounts_drive = true
                `),
            ).toThrowError(new MultipleAccountsDrivesError(["a", "b"]));
        });

        it("should fail for accounts_drive_size on an unmarked drive", () => {
            expect(
                check(`
                    [nvrams.state]
                    size = "8Mi"
                    accounts_drive_size = "4Mi"
                `),
            ).toThrowError(
                new InvalidAccountsDriveError(
                    "state",
                    "accounts_drive_size requires accounts_drive = true",
                ),
            );
        });

        it.each([
            ['builder = "empty"\nformat = "ext2"\nsize = "4MB"'],
            ['builder = "docker"'],
        ])("should fail for a drive with a filesystem: %s", (drive) => {
            expect(
                check(`[drives.accounts]\n${drive}\naccounts_drive = true`),
            ).toThrowError(
                new InvalidAccountsDriveError(
                    "accounts",
                    'it must not have a filesystem, use builder = "empty" and format = "raw", or declare it under [nvrams.accounts]',
                ),
            );
        });

        it("should fail for a mounted drive", () => {
            expect(
                check(`
                    [drives.accounts]
                    builder = "empty"
                    format = "raw"
                    size = "4MB"
                    mount = "/mnt/accounts"
                    accounts_drive = true
                `),
            ).toThrowError(
                new InvalidAccountsDriveError(
                    "accounts",
                    "it can't be mounted, remove 'mount' or set it to false",
                ),
            );
        });

        it("should suggest the next power of two for the size", () => {
            expect(
                check('[nvrams.accounts]\nsize = "3Mi"\naccounts_drive = true'),
            ).toThrowError(
                new InvalidAccountsDriveError(
                    "accounts",
                    'size 3145728 is not a power of two, use "4Mi", or set accounts_drive_size to keep the accounts at the beginning of a larger drive',
                ),
            );
        });

        it("should accept a size that is not a power of two with accounts_drive_size", () => {
            expect(
                check(`
                    [nvrams.state]
                    size = "12Mi"
                    accounts_drive = true
                    accounts_drive_size = "4Mi"
                `),
            ).not.toThrow();
        });

        it("should fail for an accounts_drive_size that is not a power of two", () => {
            expect(
                check(`
                    [nvrams.state]
                    size = "12Mi"
                    accounts_drive = true
                    accounts_drive_size = "3Mi"
                `),
            ).toThrowError(
                new InvalidAccountsDriveError(
                    "state",
                    'accounts_drive_size 3145728 is not a power of two, use "4Mi"',
                ),
            );
        });

        it("should fail for an accounts_drive_size larger than the drive", () => {
            expect(
                check(`
                    [nvrams.state]
                    size = "4Mi"
                    accounts_drive = true
                    accounts_drive_size = "8Mi"
                `),
            ).toThrowError(
                new InvalidAccountsDriveError(
                    "state",
                    "accounts_drive_size 8388608 is larger than the drive itself (4194304 bytes)",
                ),
            );
        });

        it("should fail for a drive smaller than one account", () => {
            expect(() =>
                parse([
                    `
                    [nvrams.accounts]
                    size = "4Ki"
                    accounts_drive = true

                    [withdrawal.config]
                    log2_leaves_per_account = 8
                    `,
                ]),
            ).toThrowError(
                new InvalidAccountsDriveError(
                    "accounts",
                    "size 4096 is smaller than one account of 8192 bytes",
                ),
            );
        });

        it("should leave the size of an nvram backed by an image to the build", () => {
            expect(
                check(
                    '[nvrams.accounts]\nfilename = "./accounts.raw"\naccounts_drive = true',
                ),
            ).not.toThrow();
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

        // drive sizes read the same as nvram sizes
        it.each([
            ["4096", 4096],
            ['"4096"', 4096],
            ['"4Ki"', 4096],
            ['"4Mi"', 4194304],
            ['"4MiB"', 4194304],
            ['"4MB"', 4194304],
            ['"100Mb"', 104857600],
            ['"1Ti"', 2 ** 40],
            ['"1TB"', 2 ** 40],
            ['"1Pi"', 2 ** 50],
            ['"1PB"', 2 ** 50],
        ])("should parse drive size %s as %i bytes", (size, expected) => {
            const config = parse([
                `[drives.data]\nbuilder = "empty"\nsize = ${size}`,
                `[drives.root]\nextra_size = ${size}`,
            ]);
            expect(config.drives.data).toMatchObject({ size: expected });
            expect(config.drives.root).toMatchObject({ extraSize: expected });
        });

        it("should fail for an unparseable drive size", () => {
            expect(() =>
                parse(['[drives.data]\nbuilder = "empty"\nsize = "4XB"']),
            ).toThrowError(new InvalidBytesValueError("4XB"));
        });

        // sizes are numbers, which can't hold every integer beyond 2^53 bytes (8 PiB)
        it.each([
            ['"9PB"', "9PB"],
            ["9007199254740993", 9007199254740993n],
        ])(
            "should fail for a drive size beyond 2^53 bytes: %s",
            (size, parsed) => {
                expect(() =>
                    parse([`[drives.data]\nbuilder = "empty"\nsize = ${size}`]),
                ).toThrowError(new InvalidBytesValueError(parsed));
            },
        );
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
            ['"1Ti"', 2 ** 40],
            ['"1PB"', 2 ** 50],
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
     * accounts_drive
     */
    describe("when parsing the accounts drive marker", () => {
        it("should find a marked raw drive", () => {
            const config = parse([
                `
                [drives.accounts]
                builder = "empty"
                format = "raw"
                size = "4Mi"
                accounts_drive = true
                `,
            ]);
            expect(config.drives.accounts).toMatchObject({
                accountsDrive: true,
            });
            expect(getAccountsDrive(config)).toMatchObject({
                kind: "flash_drive",
                label: "accounts",
            });
        });

        it("should find a marked nvram with the accounts at its beginning", () => {
            const config = parse([
                `
                [nvrams.state]
                size = "12Mi"
                accounts_drive = true
                accounts_drive_size = "4Mi"
                `,
            ]);
            expect(config.nvrams.state).toMatchObject({
                accountsDrive: true,
                accountsDriveSize: 4 * 1024 * 1024,
            });
            expect(getAccountsDrive(config)).toMatchObject({
                kind: "nvram",
                label: "state",
            });
        });

        it("should leave the marker out of unmarked drives and nvrams", () => {
            const config = parse(['[nvrams.input]\nsize = "4Ki"']);
            expect(config.drives.root).not.toHaveProperty("accountsDrive");
            expect(config.nvrams.input).not.toHaveProperty("accountsDrive");
            expect(getAccountsDrive(config)).toBeUndefined();
        });

        it("should fail for an invalid marker", () => {
            expect(() =>
                parse(['[nvrams.input]\nsize = "4Ki"\naccounts_drive = 1']),
            ).toThrowError(new InvalidBooleanValueError(1));
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
