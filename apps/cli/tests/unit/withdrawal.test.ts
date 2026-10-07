import { describe, expect, it } from "bun:test";
import {
    InvalidAccountsDriveError,
    InvalidWithdrawalConfigError,
    parse,
} from "../../src/config.js";
import {
    DEVNET_GUARDIAN,
    DEVNET_WITHDRAWAL_OUTPUT_BUILDER,
    resolveAccountsDriveLayout,
    resolveWithdrawalConfig,
    type StoredMachineConfig,
} from "../../src/withdrawal.js";

const MiB = 1024 * 1024;

const ACCOUNTS_NVRAM = `
[nvrams.state]
size = "4Ki"

[nvrams.accounts]
size = "4Mi"
accounts_drive = true
`;

// placement as cartesi-machine stores it in config.json
const stored = (
    nvram: StoredMachineConfig["config"]["nvram"],
    flash_drive: StoredMachineConfig["config"]["flash_drive"] = [
        { label: "root", start: 0x80000000000, length: 0x10000000 },
    ],
): StoredMachineConfig => ({ config: { flash_drive, nvram } });

const NVRAMS = stored([
    { label: "state", start: 0x100000000000, length: 4096 },
    { label: "accounts", start: 0x100000400000, length: 4 * MiB },
]);

describe("resolveAccountsDriveLayout", () => {
    it("should resolve nothing without an accounts drive", () => {
        const config = parse(["[nvrams.state]\nsize = 4096"]);
        expect(resolveAccountsDriveLayout(config, NVRAMS)).toBeUndefined();
    });

    it("should locate an nvram and its uio device", () => {
        const config = parse([ACCOUNTS_NVRAM]);
        expect(resolveAccountsDriveLayout(config, NVRAMS)).toEqual({
            kind: "nvram",
            label: "accounts",
            device: "/dev/uio1",
            driveLength: BigInt(4 * MiB),
            length: BigInt(4 * MiB),
            log2Length: 22,
            start: 0x100000400000n,
            startIndex: 0x100000400000n / BigInt(4 * MiB),
        });
    });

    it("should locate a flash drive and its pmem device", () => {
        const config = parse([
            `
            [drives.accounts]
            builder = "empty"
            format = "raw"
            size = "4Mb"
            accounts_drive = true
            `,
        ]);
        const layout = resolveAccountsDriveLayout(
            config,
            stored(
                [],
                [
                    {
                        label: "accounts",
                        start: 0x80000000000,
                        length: 4 * MiB,
                    },
                    { label: "root", start: 0x90000000000, length: 0x10000000 },
                ],
            ),
        );
        expect(layout?.device).toEqual("/dev/pmem0");
        expect(layout?.startIndex).toEqual(0x80000000000n / BigInt(4 * MiB));
    });

    it("should fail when the drive is not in the built machine", () => {
        const config = parse([ACCOUNTS_NVRAM]);
        expect(() =>
            resolveAccountsDriveLayout(config, stored([])),
        ).toThrowError(InvalidAccountsDriveError);
    });

    it("should fail when the built length is not a power of two", () => {
        // an nvram backed by an image has its length decided by the image
        const config = parse([
            '[nvrams.accounts]\nfilename = "accounts.raw"\naccounts_drive = true',
        ]);
        const machine = stored([
            { label: "accounts", start: 0x100000000000, length: 3 * MiB },
        ]);
        expect(() => resolveAccountsDriveLayout(config, machine)).toThrowError(
            InvalidAccountsDriveError,
        );
    });

    it("should keep the accounts at the beginning of a larger drive", () => {
        // e.g. 4 MiB of accounts followed by application state, in a 384 MiB nvram
        const config = parse([
            `
            [nvrams.state]
            size = "384Mi"
            accounts_drive = true
            accounts_drive_size = "4Mi"
            `,
        ]);
        const layout = resolveAccountsDriveLayout(
            config,
            stored([{ label: "state", start: 0xe0000000, length: 384 * MiB }]),
        );
        expect(layout).toMatchObject({
            device: "/dev/uio0",
            driveLength: BigInt(384 * MiB),
            length: BigInt(4 * MiB),
            log2Length: 22,
            startIndex: 0xe0000000n / BigInt(4 * MiB),
        });
        if (!layout) throw new Error("no accounts drive");
        expect(resolveWithdrawalConfig(config, layout)).toMatchObject({
            log2_max_num_of_accounts: 17,
            accounts_drive_start_index: 0xe0000000 / (4 * MiB),
        });
    });

    it("should fail when the accounts are larger than the built drive", () => {
        // an nvram backed by an image has its length decided by the image
        const config = parse([
            '[nvrams.accounts]\nfilename = "accounts.raw"\naccounts_drive = true\naccounts_drive_size = "8Mi"',
        ]);
        const machine = stored([
            { label: "accounts", start: 0x100000000000, length: 6 * MiB },
        ]);
        expect(() => resolveAccountsDriveLayout(config, machine)).toThrowError(
            InvalidAccountsDriveError,
        );
    });

    it("should fail when the start is not aligned to the length", () => {
        const config = parse([ACCOUNTS_NVRAM]);
        const machine = stored([
            { label: "accounts", start: 0x100000001000, length: 4 * MiB },
        ]);
        expect(() => resolveAccountsDriveLayout(config, machine)).toThrowError(
            InvalidAccountsDriveError,
        );
    });
});

describe("resolveWithdrawalConfig", () => {
    const layoutOf = (toml: string[]) => {
        const config = parse(toml);
        const layout = resolveAccountsDriveLayout(config, NVRAMS);
        if (!layout) throw new Error("no accounts drive");
        return { config, layout };
    };

    it("should derive the configuration with devnet defaults", () => {
        const { config, layout } = layoutOf([ACCOUNTS_NVRAM]);
        expect(resolveWithdrawalConfig(config, layout)).toEqual({
            guardian: DEVNET_GUARDIAN,
            log2_leaves_per_account: 0,
            log2_max_num_of_accounts: 17, // 2^22 bytes / 2^5 bytes per account
            accounts_drive_start_index: Number(
                0x100000400000n / BigInt(4 * MiB),
            ),
            withdrawal_output_builder: DEVNET_WITHDRAWAL_OUTPUT_BUILDER,
        });
    });

    it("should apply overrides", () => {
        const { config, layout } = layoutOf([
            ACCOUNTS_NVRAM,
            `
            [withdrawal]
            guardian = "0x1111111111111111111111111111111111111111"
            log2_leaves_per_account = 1
            withdrawal_output_builder = "0x2222222222222222222222222222222222222222"
            `,
        ]);
        expect(resolveWithdrawalConfig(config, layout)).toMatchObject({
            guardian: "0x1111111111111111111111111111111111111111",
            log2_leaves_per_account: 1,
            log2_max_num_of_accounts: 16,
            withdrawal_output_builder:
                "0x2222222222222222222222222222222222222222",
        });
    });

    it("should require an output builder on a fork", () => {
        const { config, layout } = layoutOf([ACCOUNTS_NVRAM]);
        expect(() =>
            resolveWithdrawalConfig(config, layout, { fork: true }),
        ).toThrowError(InvalidWithdrawalConfigError);
    });

    it("should accept an overridden output builder on a fork", () => {
        const { config, layout } = layoutOf([
            ACCOUNTS_NVRAM,
            '[withdrawal]\nwithdrawal_output_builder = "0x2222222222222222222222222222222222222222"',
        ]);
        expect(
            resolveWithdrawalConfig(config, layout, { fork: true })
                .withdrawal_output_builder,
        ).toEqual("0x2222222222222222222222222222222222222222");
    });
});
