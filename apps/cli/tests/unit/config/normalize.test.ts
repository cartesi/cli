import { describe, expect, it } from "bun:test";
import {
    defaultConfig,
    defaultMachineConfig,
    defaultRootDriveConfig,
    defineConfig,
    type DockerDriveConfig,
    InvalidAddressValueError,
    InvalidBooleanValueError,
    InvalidBuilderError,
    InvalidBytesValueError,
    InvalidDriveFormatError,
    InvalidEnumValueError,
    InvalidNumberValueError,
    InvalidSectionError,
    InvalidStringValueError,
    normalizeConfig,
    RequiredFieldError,
    type WithdrawalConfig,
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

    describe("withdrawal", () => {
        const withdrawal: WithdrawalConfig = {
            guardian: "0x1111111111111111111111111111111111111111",
            log2_leaves_per_account: 0,
            log2_max_num_of_accounts: 20,
            accounts_drive_start_index: 33554432,
            withdrawal_output_builder:
                "0x2222222222222222222222222222222222222222",
        };

        it("should parse a valid withdrawal configuration", () => {
            expect(normalizeConfig({ withdrawal }).withdrawalConfig).toEqual(
                withdrawal,
            );
        });

        it("should accept the resolved 'withdrawalConfig' name, so a resolved configuration can be given back", () => {
            expect(
                normalizeConfig({ withdrawalConfig: withdrawal })
                    .withdrawalConfig,
            ).toEqual(withdrawal);
        });

        it("should be undefined when not given or empty", () => {
            expect(normalizeConfig({}).withdrawalConfig).toBeUndefined();
            expect(
                normalizeConfig({ withdrawal: {} }).withdrawalConfig,
            ).toBeUndefined();
        });

        it("should fail when a field is missing", () => {
            expect(() =>
                normalizeConfig({
                    withdrawal: {
                        ...withdrawal,
                        guardian: undefined,
                    },
                }),
            ).toThrowError(new RequiredFieldError("guardian"));
        });

        it("should fail when an address is invalid", () => {
            expect(() =>
                normalizeConfig({
                    withdrawal: { ...withdrawal, guardian: "invalid" },
                }),
            ).toThrowError(new InvalidAddressValueError("invalid", "guardian"));
        });
    });
});
