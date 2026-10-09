import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import tmp from "tmp";
import {
    InvalidAccountsDriveError,
    InvalidWithdrawalConfigError,
    parse,
} from "../../src/config.js";
import {
    DEVNET_GUARDIAN,
    DEVNET_WITHDRAWAL_OUTPUT_BUILDER,
    describeWithdrawalConfig,
    getWithdrawalConfig,
    resolveAccountsDriveLayout,
    resolveWithdrawalConfig,
    type StoredMachineConfig,
} from "../../src/withdrawal.js";

/**
 * Placement by cartesi-machine 0.21 of a 1 MiB root, a 1 MiB drive and a 4 MiB accounts drive,
 * which skips 0x88200000 to align to its size. The nvram follows them, aligned to 4 MiB.
 */
const stored: StoredMachineConfig = {
    config: {
        flash_drive: [
            { label: "root", start: 0x88000000, length: 0x100000 },
            { label: "data", start: 0x88100000, length: 0x100000 },
            { label: "accounts", start: 0x88400000, length: 0x400000 },
        ],
        nvram: [{ label: "state", start: 0x88800000, length: 0xc00000 }],
    },
};

const drives = `
    [drives.data]
    builder = "empty"
    format = "raw"
    size = "1MB"

    [drives.accounts]
    builder = "empty"
    format = "raw"
    size = "4MB"
    accounts_drive = true
`;

const withAccountsDrive = (withdrawal?: string) =>
    parse([
        withdrawal === undefined
            ? drives
            : `${drives}\n[withdrawal.config]\n${withdrawal}`,
    ]);

describe("resolveAccountsDriveLayout", () => {
    it("should read the placement of the accounts drive from the built machine", () => {
        expect(resolveAccountsDriveLayout(withAccountsDrive(), stored)).toEqual(
            {
                kind: "flash_drive",
                label: "accounts",
                device: "/dev/pmem2",
                driveLength: 0x400000n,
                length: 0x400000n,
                log2Length: 22,
                start: 0x88400000n,
                startIndex: 0x221n,
            },
        );
    });

    it("should keep the accounts at the beginning of a larger nvram", () => {
        const config = parse([
            `
            [nvrams.state]
            size = "12Mi"
            accounts_drive = true
            accounts_drive_size = "4Mi"
            `,
        ]);
        expect(resolveAccountsDriveLayout(config, stored)).toEqual({
            kind: "nvram",
            label: "state",
            device: "/dev/uio0",
            driveLength: 0xc00000n,
            length: 0x400000n,
            log2Length: 22,
            start: 0x88800000n,
            startIndex: 0x222n,
        });
    });

    it("should return undefined without an accounts drive", () => {
        expect(resolveAccountsDriveLayout(parse([""]), stored)).toBeUndefined();
    });

    it("should fail when the accounts drive is not in the built machine", () => {
        expect(() =>
            resolveAccountsDriveLayout(withAccountsDrive(), {
                config: { flash_drive: stored.config.flash_drive?.slice(0, 2) },
            }),
        ).toThrowError(
            new InvalidAccountsDriveError(
                "accounts",
                "not found in the built machine, run 'cartesi build'",
            ),
        );
    });

    it("should fail when the accounts drive is not aligned to its size", () => {
        expect(() =>
            resolveAccountsDriveLayout(withAccountsDrive(), {
                config: {
                    flash_drive: [
                        {
                            label: "accounts",
                            start: 0x88300000,
                            length: 0x400000,
                        },
                    ],
                },
            }),
        ).toThrowError(
            new InvalidAccountsDriveError(
                "accounts",
                "start 0x88300000 is not aligned to its size 0x400000, so its start index is not an integer",
            ),
        );
    });

    // an nvram backed by an existing image has no size until it is built
    it("should check the built length of an nvram backed by an image", () => {
        const config = parse([
            `
            [nvrams.state]
            filename = "./state.raw"
            accounts_drive = true
            `,
        ]);
        expect(() => resolveAccountsDriveLayout(config, stored)).toThrowError(
            new InvalidAccountsDriveError(
                "state",
                'size 12582912 is not a power of two, use "16Mi", or set accounts_drive_size to keep the accounts at the beginning of a larger drive',
            ),
        );
    });

    it("should fail for a placement it can't read without losing precision", () => {
        expect(() =>
            resolveAccountsDriveLayout(withAccountsDrive(), {
                config: {
                    flash_drive: [
                        { label: "accounts", start: 2 ** 60, length: 0x400000 },
                    ],
                },
            }),
        ).toThrowError(InvalidAccountsDriveError);
    });
});

describe("resolveWithdrawalConfig", () => {
    const resolve = (withdrawal = "", options?: { fork?: boolean }) => {
        const config = withAccountsDrive(withdrawal);
        const layout = resolveAccountsDriveLayout(config, stored);
        if (!layout) {
            throw new Error("no accounts drive");
        }
        return resolveWithdrawalConfig(config, layout, options);
    };

    it("should derive the layout and default to the devnet addresses", () => {
        expect(resolve()).toEqual({
            guardian: DEVNET_GUARDIAN,
            log2_leaves_per_account: 0,
            log2_max_num_of_accounts: 17,
            accounts_drive_start_index: 0x221n,
            withdrawal_output_builder: DEVNET_WITHDRAWAL_OUTPUT_BUILDER,
        });
    });

    it("should use the given addresses", () => {
        expect(
            resolve(`
                guardian = "0x1111111111111111111111111111111111111111"
                withdrawal_output_builder = "0x2222222222222222222222222222222222222222"
            `),
        ).toMatchObject({
            guardian: "0x1111111111111111111111111111111111111111",
            withdrawal_output_builder:
                "0x2222222222222222222222222222222222222222",
        });
    });

    it.each([["account_size = 64"], ["log2_leaves_per_account = 1"]])(
        "should fit fewer accounts when they are larger: %s",
        (accountSize) => {
            expect(
                resolve(`
                withdrawal_output_builder = "0x2222222222222222222222222222222222222222"
                ${accountSize}
            `),
            ).toMatchObject({
                log2_leaves_per_account: 1,
                log2_max_num_of_accounts: 16,
            });
        },
    );

    it.each([
        ["account_size = 64"],
        ["log2_leaves_per_account = 1"],
        [
            `account_size = 64\nwithdrawal_output_builder = "${DEVNET_WITHDRAWAL_OUTPUT_BUILDER}"`,
        ],
    ])(
        "should fail for accounts the devnet builder can't read: %s",
        (accountSize) => {
            expect(() => resolve(accountSize)).toThrowError(
                new InvalidWithdrawalConfigError(
                    "the devnet withdrawal output builder expects accounts of 32 bytes, but they are set to 64 bytes. Remove account_size, or set withdrawal_output_builder to a builder for 64-byte accounts",
                ),
            );
        },
    );

    it("should accept layout keys that match the built machine", () => {
        expect(
            resolve(`
                log2_max_num_of_accounts = 17
                accounts_drive_start_index = 0x221
            `),
        ).toMatchObject({
            log2_max_num_of_accounts: 17,
            accounts_drive_start_index: 0x221n,
        });
    });

    it("should fail for a start index the built machine moved", () => {
        expect(() =>
            resolve("accounts_drive_start_index = 0x200"),
        ).toThrowError(
            new InvalidWithdrawalConfigError(
                "accounts_drive_start_index is 512 (0x200), but the built machine places the accounts drive 'accounts' at index 545 (0x221). Remove it to use the derived value, or check what moved the drive: a drive declared before it was added or resized, the root drive grew, ram_length changed, or the emulator version changed",
            ),
        );
    });

    it("should fail for a number of accounts that doesn't fit the drive", () => {
        expect(() => resolve("log2_max_num_of_accounts = 20")).toThrowError(
            new InvalidWithdrawalConfigError(
                "log2_max_num_of_accounts is 20, but the accounts drive 'accounts' of 4194304 bytes holds 2^17 accounts of 32 bytes. Remove it to use the derived value, or change the size of the drive",
            ),
        );
    });

    it("should require the addresses on a fork", () => {
        expect(() => resolve("", { fork: true })).toThrowError(
            new InvalidWithdrawalConfigError(
                "the devnet defaults don't apply to a fork, set guardian and withdrawal_output_builder",
            ),
        );
        expect(() =>
            resolve('guardian = "0x1111111111111111111111111111111111111111"', {
                fork: true,
            }),
        ).toThrowError(
            new InvalidWithdrawalConfigError(
                "the devnet defaults don't apply to a fork, set withdrawal_output_builder",
            ),
        );
    });
});

describe("getWithdrawalConfig", () => {
    it("should be undefined when emergency withdrawal is off", () => {
        expect(
            getWithdrawalConfig(parse([""]), "/nonexistent"),
        ).toBeUndefined();
    });

    it("should derive the configuration from the stored machine", () => {
        const dir = tmp.dirSync({ unsafeCleanup: true });
        try {
            fs.writeFileSync(
                path.join(dir.name, "config.json"),
                JSON.stringify(stored),
            );
            expect(
                getWithdrawalConfig(withAccountsDrive(), dir.name),
            ).toMatchObject({
                accounts_drive_start_index: 0x221n,
                log2_max_num_of_accounts: 17,
            });
        } finally {
            dir.removeCallback();
        }
    });

    it("should ask for a build when there is no stored machine", () => {
        expect(() =>
            getWithdrawalConfig(withAccountsDrive(), "/nonexistent"),
        ).toThrowError(
            "Machine configuration /nonexistent/config.json not found, run 'cartesi build'",
        );
    });
});

describe("describeWithdrawalConfig", () => {
    const describeConfig = (config: ReturnType<typeof parse>) => {
        const layout = resolveAccountsDriveLayout(config, stored);
        if (!layout) {
            throw new Error("no accounts drive");
        }
        return stripVTControlCharacters(
            describeWithdrawalConfig(
                config,
                layout,
                resolveWithdrawalConfig(config, layout),
            ),
        );
    };

    it("should show the layout, the derived values and the devnet defaults", () => {
        expect(describeConfig(withAccountsDrive())).toBe(
            [
                "accounts drive  accounts (flash drive) → /dev/pmem2",
                "start           0x88400000",
                "size            4 MiB (2^22 bytes)",
                "accounts        131072 × 32 bytes",
                "",
                "[withdrawal.config]",
                `  guardian                    ${DEVNET_GUARDIAN}  devnet account 1`,
                `  withdrawal_output_builder   ${DEVNET_WITHDRAWAL_OUTPUT_BUILDER}  devnet TestUsdWithdrawalOutputBuilder`,
                "  account_size                32 bytes                                    default",
                "  log2_leaves_per_account     0                                           derived",
                "  log2_max_num_of_accounts    17                                          derived",
                "  accounts_drive_start_index  545 (0x221)                                 derived",
                "",
                `--withdrawal-config '{"guardian":"${DEVNET_GUARDIAN}","log2_leaves_per_account":0,"log2_max_num_of_accounts":17,"accounts_drive_start_index":545,"withdrawal_output_builder":"${DEVNET_WITHDRAWAL_OUTPUT_BUILDER}"}'`,
                "devnet defaults in use: set guardian and withdrawal_output_builder in [withdrawal.config] to deploy elsewhere",
            ].join("\n"),
        );
    });

    it("should confirm the layout keys of cartesi.toml and drop the devnet notes", () => {
        const text = describeConfig(
            withAccountsDrive(`
                guardian = "0x1111111111111111111111111111111111111111"
                withdrawal_output_builder = "0x2222222222222222222222222222222222222222"
                accounts_drive_start_index = 0x221
            `),
        );
        expect(text).toContain(
            "accounts_drive_start_index  545 (0x221)                                 derived, matches cartesi.toml",
        );
        expect(text).not.toContain("devnet");
    });

    it("should show the accounts at the beginning of a larger drive", () => {
        const config = parse([
            `
            [nvrams.state]
            size = "12Mi"
            accounts_drive = true
            accounts_drive_size = "4Mi"
            `,
        ]);
        const text = describeConfig(config);
        expect(text).toContain("accounts drive  state (nvram) → /dev/uio0");
        expect(text).toContain(
            "size            4 MiB (2^22 bytes), at the beginning of 12 MiB",
        );
    });
});
