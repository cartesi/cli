/**
 * Layouts of the accounts drive the withdrawal tests build the accounts-withdrawal
 * application with, each a part of its cartesi.toml.
 *
 * Drives are declared before the accounts drive, and some layouts change the
 * RAM length, so the accounts drive doesn't land where a default app puts it.
 */

const MiB = 1024 * 1024;

export type Layout = {
    name: string;
    config: string; // drives, nvrams and machine of cartesi.toml
    label: string; // of the accounts drive, which the application looks it up by
    device: string;
    accountsSize?: number; // accounts at the beginning of a larger drive
    // existing image of the accounts drive, written into the application before the build
    image?: {
        filename: string;
        size: number;
        at: number; // offset of data, the rest is zeros
        data: Buffer;
    };
    // TODO: the machine-tool of rollups-node v2.0.0-alpha.13 only looks for the
    // accounts drive among the flash drives, unskip once it finds nvrams too
    skip?: boolean;
};

const scratchDrive = `
[drives.scratch]
builder = "empty"
format = "raw"
size = "3MB"
mount = false
`;

export const layouts: Layout[] = [
    {
        name: "a whole flash drive",
        config: `${scratchDrive}
[drives.accounts]
builder = "empty"
format = "raw"
size = "1MB"
user = "dapp"
accounts_drive = true
`,
        label: "accounts",
        device: "/dev/pmem2",
    },
    {
        name: "the beginning of a larger flash drive",
        config: `
[machine]
ram_length = "256Mi"
${scratchDrive}
[drives.state]
builder = "empty"
format = "raw"
size = "24MB"
user = "dapp"
accounts_drive = true
accounts_drive_size = "4MB"
`,
        label: "state",
        device: "/dev/pmem2",
        accountsSize: 4 * MiB,
    },
    {
        name: "a whole nvram",
        config: `${scratchDrive}
[nvrams.accounts]
size = "4Mi"
user = "dapp"
accounts_drive = true
`,
        label: "accounts",
        device: "/dev/uio0",
        skip: true,
    },
    {
        name: "the beginning of a larger nvram",
        config: `
[machine]
ram_length = "256Mi"

[nvrams.scratch]
size = "4Ki"

[nvrams.state]
size = "12Mi"
user = "dapp"
accounts_drive = true
accounts_drive_size = "4Mi"
`,
        label: "state",
        device: "/dev/uio1",
        accountsSize: 4 * MiB,
        skip: true,
    },
    {
        // like a DEX, which memory-maps its state after the accounts, from an image
        // whose size is only known once built
        name: "the beginning of an nvram image holding application state",
        config: `${scratchDrive}
[nvrams.state]
filename = "./state.raw"
user = "dapp"
accounts_drive = true
accounts_drive_size = "4Mi"
`,
        label: "state",
        device: "/dev/uio0",
        accountsSize: 4 * MiB,
        image: {
            filename: "state.raw",
            size: 12 * MiB,
            at: 4 * MiB,
            data: Buffer.alloc(8 * MiB, 0xab),
        },
        skip: true,
    },
];
