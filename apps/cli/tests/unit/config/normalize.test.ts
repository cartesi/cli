import { describe, expect, it } from "bun:test";
import {
    defaultConfig,
    defaultMachineConfig,
    defaultRootDriveConfig,
    defineConfig,
    type DockerDriveConfig,
    DuplicateLabelError,
    getAccountsDrive,
    InvalidAccountsDriveError,
    InvalidAddressValueError,
    InvalidBooleanValueError,
    InvalidBuilderError,
    InvalidBytesValueError,
    InvalidDriveFormatError,
    InvalidEnumValueError,
    InvalidNumberValueError,
    InvalidNvramSizeError,
    InvalidSectionError,
    InvalidStringValueError,
    InvalidWithdrawalConfigError,
    MAX_NVRAMS,
    MissingNvramSourceError,
    MultipleAccountsDrivesError,
    normalizeConfig,
    NVRAM_ALIGNMENT,
    RequiredFieldError,
    TooManyNvramsError,
} from "../../../src/config/index.js";

describe("defineConfig", () => {
    it("should return the configuration unchanged", () => {
        const config = { sdk: "my/sdk:1.0.0" };
        expect(defineConfig(config)).toBe(config);
    });

    it("should return a configuration function unchanged", () => {
        const fn = () => ({ sdk: "my/sdk:1.0.0" });
        expect(defineConfig(fn)).toBe(fn);
    });
});

// the default root drive is built by docker, narrowed so the expectations
// below can spread it and still be checked against that member of the union
const defaultRootDrive = () => defaultRootDriveConfig() as DockerDriveConfig;

describe("normalizeConfig", () => {
    it("should apply the defaults to an empty configuration", () => {
        expect(normalizeConfig(undefined)).toEqual(defaultConfig());
        expect(normalizeConfig({})).toEqual(defaultConfig());
    });

    it("should be idempotent on an already resolved configuration", () => {
        const config = normalizeConfig({
            drives: { data: { builder: "empty", size: "64Mb" } },
            machine: { entrypoint: "dapp", ramLength: "256Mi" },
            run: { epochLength: 10 },
            sdk: "my/sdk:1.0.0",
        });
        expect(normalizeConfig(config)).toEqual(config);
    });

    it("should ignore the '$schema' key of a JSON configuration", () => {
        expect(
            normalizeConfig({ $schema: "https://cartesi.io/schema.json" }),
        ).toEqual(defaultConfig());
    });

    it("should fail for a configuration that is not an object", () => {
        expect(() => normalizeConfig(42)).toThrowError(
            new InvalidSectionError("config", 42),
        );
    });

    describe("drives", () => {
        it("should add a default root drive", () => {
            const config = normalizeConfig({
                drives: { data: { builder: "empty", size: 128 } },
            });
            expect(config.drives.root).toEqual(defaultRootDrive());
            expect(config.drives.data).toEqual({
                builder: "empty",
                format: "ext2",
                mount: undefined,
                shared: undefined,
                size: 128,
                user: undefined,
            });
        });

        it("should default the builder to docker", () => {
            const config = normalizeConfig({
                drives: { root: { dockerfile: "backend/Dockerfile" } },
            });
            expect(config.drives.root).toEqual({
                ...defaultRootDrive(),
                dockerfile: "backend/Dockerfile",
            });
        });

        it("should parse human readable sizes", () => {
            const config = normalizeConfig({
                drives: {
                    data: { builder: "directory", directory: "data" },
                    root: { extraSize: "10Mb" },
                },
            });
            expect(config.drives.root).toEqual({
                ...defaultRootDrive(),
                extraSize: 10 * 1024 * 1024,
            });
            expect(config.drives.data).toMatchObject({ extraSize: 0 });
        });

        it("should infer the format of an existing drive from its filename", () => {
            const config = normalizeConfig({
                drives: {
                    doom: { builder: "none", filename: "doom.sqfs" },
                },
            });
            expect(config.drives.doom).toMatchObject({ format: "sqfs" });
        });

        it("should keep the drive options common to every builder", () => {
            const config = normalizeConfig({
                drives: {
                    data: {
                        builder: "tar",
                        filename: "data.tar",
                        mount: "/mnt/data",
                        shared: true,
                        user: "dapp",
                    },
                },
            });
            expect(config.drives.data).toEqual({
                builder: "tar",
                extraSize: 0,
                filename: "data.tar",
                format: "ext2",
                mount: "/mnt/data",
                shared: true,
                user: "dapp",
            });
        });

        it("should fail for an invalid builder", () => {
            expect(() =>
                normalizeConfig({ drives: { root: { builder: "invalid" } } }),
            ).toThrowError(new InvalidBuilderError("invalid"));
        });

        it("should fail for an invalid format", () => {
            expect(() =>
                normalizeConfig({ drives: { root: { format: "invalid" } } }),
            ).toThrowError(new InvalidDriveFormatError("invalid"));
        });

        it("should fail for an invalid size", () => {
            expect(() =>
                normalizeConfig({
                    drives: { root: { extraSize: "abc" } },
                }),
            ).toThrowError(new InvalidBytesValueError("abc"));
        });

        it("should fail when a required field is missing", () => {
            expect(() =>
                normalizeConfig({ drives: { data: { builder: "directory" } } }),
            ).toThrowError(new RequiredFieldError("directory"));
            expect(() =>
                normalizeConfig({ drives: { data: { builder: "tar" } } }),
            ).toThrowError(new RequiredFieldError("filename"));
        });

        it("should fail when drives is not an object", () => {
            expect(() => normalizeConfig({ drives: 42 })).toThrowError(
                new InvalidSectionError("drives", 42),
            );
        });
    });

    describe("machine", () => {
        it("should apply the machine defaults", () => {
            expect(normalizeConfig({ machine: {} }).machine).toEqual(
                defaultMachineConfig(),
            );
        });

        it("should coerce non-string environment variables", () => {
            expect(
                normalizeConfig({
                    machine: { env: { ENABLED: true, PORT: 8080 } },
                }).machine.env,
            ).toEqual({ ENABLED: "true", PORT: "8080" });
        });

        it("should accept a number as the maximum cycle count", () => {
            expect(
                normalizeConfig({ machine: { maxMCycle: 100 } }).machine
                    .maxMCycle,
            ).toBe(100n);
        });

        it("should fail for an invalid boolean", () => {
            expect(() =>
                normalizeConfig({ machine: { useDockerEnv: 42 } }),
            ).toThrowError(new InvalidBooleanValueError(42));
        });

        it("should fail for an invalid entrypoint", () => {
            expect(() =>
                normalizeConfig({ machine: { entrypoint: 42 } }),
            ).toThrowError(new InvalidStringValueError(42));
        });
    });

    describe("run", () => {
        it("should be empty by default", () => {
            expect(normalizeConfig({}).run).toEqual({});
        });

        it("should keep the run options", () => {
            expect(
                normalizeConfig({
                    run: {
                        blockTime: 1,
                        defaultBlock: "finalized",
                        epochLength: 10,
                        projectName: "my-app",
                        prt: true,
                        services: ["explorer", "bundler"],
                    },
                }).run,
            ).toEqual({
                blockTime: 1,
                claimStagingPeriod: undefined,
                cpus: undefined,
                defaultBlock: "finalized",
                epochLength: 10,
                forkBlockNumber: undefined,
                forkUrl: undefined,
                memory: undefined,
                port: undefined,
                projectName: "my-app",
                prt: true,
                runtimeVersion: undefined,
                services: ["explorer", "bundler"],
                verbose: undefined,
            });
        });

        it("should fail for an invalid default block", () => {
            expect(() =>
                normalizeConfig({ run: { defaultBlock: "invalid" } }),
            ).toThrowError(
                new InvalidEnumValueError("defaultBlock", "invalid", [
                    "latest",
                    "safe",
                    "pending",
                    "finalized",
                ]),
            );
        });

        it("should fail for an invalid number", () => {
            expect(() =>
                normalizeConfig({ run: { epochLength: "ten" } }),
            ).toThrowError(new InvalidNumberValueError("ten", "epochLength"));
        });

        it("should fail for invalid services", () => {
            expect(() =>
                normalizeConfig({ run: { services: [42] } }),
            ).toThrowError(new InvalidStringValueError(42));
        });
    });

    describe("nvrams", () => {
        it("should be empty by default", () => {
            expect(normalizeConfig({}).nvrams).toEqual({});
        });

        it("should normalize a pristine nvram", () => {
            expect(
                normalizeConfig({ nvrams: { state: { size: "8Ki" } } }).nvrams
                    .state,
            ).toEqual({
                filename: undefined,
                shared: undefined,
                size: 8192,
                user: undefined,
            });
        });

        it("should normalize an nvram backed by an image", () => {
            expect(
                normalizeConfig({
                    nvrams: { state: { filename: "state.raw", shared: true } },
                }).nvrams.state,
            ).toEqual({
                filename: "state.raw",
                shared: true,
                size: undefined,
                user: undefined,
            });
        });

        it("should fail without a size or a filename", () => {
            expect(() =>
                normalizeConfig({ nvrams: { state: {} } }),
            ).toThrowError(new MissingNvramSourceError("state"));
        });

        it("should fail for a size that is not a multiple of the alignment", () => {
            expect(() =>
                normalizeConfig({ nvrams: { state: { size: 100 } } }),
            ).toThrowError(new InvalidNvramSizeError("state", 100));
            expect(() =>
                normalizeConfig({ nvrams: { state: { size: 0 } } }),
            ).toThrowError(new InvalidNvramSizeError("state", 0));
        });

        it("should fail for more nvrams than the guest exposes", () => {
            const nvrams = Object.fromEntries(
                Array.from({ length: MAX_NVRAMS + 1 }, (_, i) => [
                    `state${i}`,
                    { size: NVRAM_ALIGNMENT },
                ]),
            );
            expect(() => normalizeConfig({ nvrams })).toThrowError(
                new TooManyNvramsError(MAX_NVRAMS + 1),
            );
        });

        it("should fail when a label is used by both a drive and an nvram", () => {
            expect(() =>
                normalizeConfig({
                    drives: { state: { builder: "empty", size: "4Ki" } },
                    nvrams: { state: { size: "4Ki" } },
                }),
            ).toThrowError(new DuplicateLabelError("state"));
        });
    });

    describe("withdrawal", () => {
        // the accounts drive is what emergency withdrawal is derived from
        const accountsNvram = {
            nvrams: { accounts: { accountsDrive: true, size: "4Ki" } },
        };

        it("should be undefined when not given", () => {
            expect(normalizeConfig(accountsNvram).withdrawal).toBeUndefined();
        });

        it("should keep the overrides of an application with an accounts drive", () => {
            expect(
                normalizeConfig({
                    ...accountsNvram,
                    withdrawal: {
                        account_size: "64",
                        guardian: "0x1111111111111111111111111111111111111111",
                        withdrawal_output_builder:
                            "0x2222222222222222222222222222222222222222",
                    },
                }).withdrawal,
            ).toEqual({
                account_size: 64,
                guardian: "0x1111111111111111111111111111111111111111",
                withdrawal_output_builder:
                    "0x2222222222222222222222222222222222222222",
            });
        });

        it("should accept an empty table, the whole configuration being derived", () => {
            expect(
                normalizeConfig({ ...accountsNvram, withdrawal: {} })
                    .withdrawal,
            ).toEqual({
                account_size: undefined,
                guardian: undefined,
                withdrawal_output_builder: undefined,
            });
        });

        it("should fail without an accounts drive", () => {
            expect(() => normalizeConfig({ withdrawal: {} })).toThrowError(
                InvalidWithdrawalConfigError,
            );
        });

        it("should fail for an invalid address", () => {
            expect(() =>
                normalizeConfig({
                    ...accountsNvram,
                    withdrawal: { guardian: "invalid" },
                }),
            ).toThrowError(new InvalidAddressValueError("invalid", "guardian"));
        });

        it("should fail for an account size that is not a power of two", () => {
            expect(() =>
                normalizeConfig({
                    ...accountsNvram,
                    withdrawal: { account_size: 48 },
                }),
            ).toThrowError(InvalidWithdrawalConfigError);
            expect(() =>
                normalizeConfig({
                    ...accountsNvram,
                    withdrawal: { account_size: 16 },
                }),
            ).toThrowError(InvalidWithdrawalConfigError);
        });
    });

    describe("accounts drive", () => {
        it("should accept a raw empty drive", () => {
            const config = normalizeConfig({
                drives: {
                    accounts: {
                        accountsDrive: true,
                        builder: "empty",
                        format: "raw",
                        size: "4Ki",
                    },
                },
            });
            expect(getAccountsDrive(config)).toMatchObject({
                kind: "flash_drive",
                label: "accounts",
            });
        });

        it("should accept an nvram", () => {
            const config = normalizeConfig({
                nvrams: { accounts: { accountsDrive: true, size: "4Ki" } },
            });
            expect(getAccountsDrive(config)).toMatchObject({
                kind: "nvram",
                label: "accounts",
            });
        });

        it("should be undefined when nothing is marked", () => {
            expect(getAccountsDrive(normalizeConfig({}))).toBeUndefined();
        });

        it("should fail when a drive has a filesystem", () => {
            expect(() =>
                normalizeConfig({
                    drives: {
                        accounts: {
                            accountsDrive: true,
                            builder: "empty",
                            size: "4Ki",
                        },
                    },
                }),
            ).toThrowError(InvalidAccountsDriveError);
        });

        it("should fail when more than one is marked", () => {
            expect(() =>
                normalizeConfig({
                    drives: {
                        accounts: {
                            accountsDrive: true,
                            builder: "empty",
                            format: "raw",
                            size: "4Ki",
                        },
                    },
                    nvrams: { other: { accountsDrive: true, size: "4Ki" } },
                }),
            ).toThrowError(
                new MultipleAccountsDrivesError(["accounts", "other"]),
            );
        });

        it("should fail for a size that is not a power of two", () => {
            expect(() =>
                normalizeConfig({
                    nvrams: {
                        accounts: { accountsDrive: true, size: 3 * 4096 },
                    },
                }),
            ).toThrowError(InvalidAccountsDriveError);
        });

        it("should fail when the accounts size is set without the marker", () => {
            expect(() =>
                normalizeConfig({
                    nvrams: {
                        state: { accountsDriveSize: "4Ki", size: "4Ki" },
                    },
                }),
            ).toThrowError(InvalidAccountsDriveError);
        });
    });
});
