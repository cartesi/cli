import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { InvalidPrtConfigError, type PrtSentry } from "../../src/config";
import {
    checkSentries,
    describeSentry,
    readSentryKeyFile,
    resolveSentries,
    SENTRY_FUNDING,
    SENTRY_POOL_SIZE,
    SENTRY_POOL_START,
    type SentryClient,
} from "../../src/sentries";
import { getDevnetAccount } from "../../src/wallet";
import { DEVNET_GUARDIAN } from "../../src/withdrawal";

const devnet = (index: number) => getDevnetAccount(index).address;
const external: Address = "0x4444444444444444444444444444444444444444";
const sling = (sentry: Omit<PrtSentry, "type"> = {}): PrtSentry => ({
    type: "sling",
    ...sentry,
});

// key files of the developer's own, never devnet accounts
let dir: string;
const keyFile = (content: string, name = `${Math.random()}.key`) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, content);
    return file;
};
const ownKey = generatePrivateKey();
const ownAddress = privateKeyToAccount(ownKey).address;

beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sentries-"));
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("resolveSentries", () => {
    it("should give bare entries the pool accounts in order, with their keys", () => {
        const { sentries } = resolveSentries({
            sentries: [sling(), sling(), sling()],
        });

        expect(sentries.map(({ address }) => address)).toEqual([
            devnet(20),
            devnet(21),
            devnet(22),
        ]);
        expect(sentries.map(({ source }) => source)).toEqual([
            { kind: "pool", index: 20 },
            { kind: "pool", index: 21 },
            { kind: "pool", index: 22 },
        ]);
        expect(sentries.map(({ privateKey }) => privateKey)).toEqual([
            getDevnetAccount(20).privateKey,
            getDevnetAccount(21).privateKey,
            getDevnetAccount(22).privateKey,
        ]);
    });

    it("should start the pool after the accounts anvil funds", () => {
        expect(SENTRY_POOL_START).toBe(20);
        expect(SENTRY_POOL_SIZE).toBe(10);
    });

    // an entry that names a pool account keeps it, so the pool must not hand
    // the same account to a bare entry, wherever the two are
    it("should skip a pool account another entry names", () => {
        const { sentries } = resolveSentries({
            sentries: [sling(), sling({ address: devnet(21) }), sling()],
        });

        expect(sentries.map(({ address }) => address)).toEqual([
            devnet(20),
            devnet(21),
            devnet(22),
        ]);
    });

    it("should skip a pool account named later in the config", () => {
        const { sentries } = resolveSentries({
            sentries: [sling(), { address: devnet(20) }],
        });

        expect(sentries.map(({ address }) => address)).toEqual([
            devnet(21),
            devnet(20),
        ]);
    });

    it("should fail naming the entry when the pool runs out", () => {
        const sentries = Array.from({ length: SENTRY_POOL_SIZE + 1 }, () =>
            sling(),
        );

        expect(() => resolveSentries({ sentries })).toThrowError(
            new InvalidPrtConfigError(
                "needs an address: the sentry pool, devnet accounts 20 to 29, is used up",
                "prt.sentries[11]",
            ),
        );
    });

    it("should keep explicit addresses and tell devnet accounts from others", () => {
        const { sentries } = resolveSentries({
            sentries: [
                sling({ address: devnet(2) }),
                { address: devnet(25) },
                { address: external },
            ],
        });

        expect(
            sentries.map(({ address, privateKey, source }) => [
                address,
                source,
                privateKey,
            ]),
        ).toEqual([
            [
                devnet(2),
                { kind: "devnet", index: 2 },
                getDevnetAccount(2).privateKey,
            ],
            [devnet(25), { kind: "pool", index: 25 }, undefined],
            [external, { kind: "external" }, undefined],
        ]);
    });

    // the CLI can run a node only with a key it has
    it("should fail for a type on an address the CLI has no key for", () => {
        expect(() =>
            resolveSentries({ sentries: [sling({ address: external })] }),
        ).toThrowError(
            new InvalidPrtConfigError(
                `the CLI has no key for ${external}: set private_key_file to run the sentry with it, or drop the type to appoint it only`,
                "prt.sentries[1]",
            ),
        );
    });

    it("should label entries by position unless they have a label", () => {
        const { sentries } = resolveSentries({
            sentries: [
                sling(),
                sling({ label: "mine" }),
                { address: external },
            ],
        });

        expect(sentries.map(({ entry, label }) => [entry, label])).toEqual([
            [1, "1"],
            [2, "mine"],
            [3, "3"],
        ]);
    });

    it("should carry the type and the manager", () => {
        const resolved = resolveSentries({
            sentryManager: devnet(5),
            sentries: [sling(), { address: external }],
        });

        expect(resolved.sentryManager).toBe(devnet(5));
        expect(resolved.sentries.map(({ type }) => type)).toEqual([
            "sling",
            undefined,
        ]);
        expect(resolved.warnings).toEqual([]);
    });

    it("should warn about a label on an entry the CLI doesn't run", () => {
        const { warnings } = resolveSentries({
            sentries: [{ address: external, label: "theirs" }],
        });

        expect(warnings).toEqual([
            "prt.sentries[1] has a label but no type, so the CLI runs nothing for it and the label names nothing",
        ]);
    });

    it("should warn about a manager with no sentries to rotate", () => {
        const { warnings } = resolveSentries({
            sentryManager: devnet(5),
            sentries: [],
        });

        expect(warnings).toEqual([
            "[prt].sentry_manager is set but there are no [[prt.sentries]]; the manager has no sentries to rotate",
        ]);
    });

    describe("with a key file", () => {
        it("should take the address from the key, without one in the entry", () => {
            const file = keyFile(ownKey);
            const { sentries } = resolveSentries({
                sentries: [sling({ privateKeyFile: file })],
            });

            expect(sentries[0]).toEqual({
                entry: 1,
                label: "1",
                address: ownAddress,
                type: "sling",
                source: { kind: "key-file", path: file },
            });
            // the key stays in the file: the init service copies it
            expect(sentries[0].privateKey).toBeUndefined();
        });

        it("should accept an address that matches the key", () => {
            const { sentries } = resolveSentries({
                sentries: [
                    sling({
                        address: ownAddress,
                        privateKeyFile: keyFile(ownKey),
                    }),
                ],
            });

            expect(sentries[0].address).toBe(ownAddress);
        });

        it("should fail for an address the key doesn't match, naming both", () => {
            const file = keyFile(ownKey);

            expect(() =>
                resolveSentries({
                    sentries: [
                        sling({ address: external, privateKeyFile: file }),
                    ],
                }),
            ).toThrowError(
                new InvalidPrtConfigError(
                    `private_key_file "${file}" is the key of ${ownAddress}, not ${external}`,
                    "prt.sentries[1]",
                ),
            );
        });

        // the devnet keys are public and derived by the CLI itself
        it("should fail for the key of a devnet account", () => {
            const file = keyFile(getDevnetAccount(3).privateKey);

            expect(() =>
                resolveSentries({
                    sentries: [sling({ privateKeyFile: file })],
                }),
            ).toThrowError(
                new InvalidPrtConfigError(
                    `private_key_file "${file}" holds the key of devnet account 3, which the CLI derives itself; drop the file, or set the address instead`,
                    "prt.sentries[1]",
                ),
            );
        });

        // a key file's address is known only after reading it
        it("should fail when a key file repeats the address of another entry", () => {
            expect(() =>
                resolveSentries({
                    sentries: [
                        { address: ownAddress },
                        sling({ privateKeyFile: keyFile(ownKey) }),
                    ],
                }),
            ).toThrowError(
                new InvalidPrtConfigError(
                    `address ${ownAddress} is also the address of prt.sentries[1]`,
                    "prt.sentries[2]",
                ),
            );
        });

        it("should skip a pool account only when an entry names it", () => {
            const { sentries } = resolveSentries({
                sentries: [sling({ privateKeyFile: keyFile(ownKey) }), sling()],
            });

            expect(sentries.map(({ address }) => address)).toEqual([
                ownAddress,
                devnet(20),
            ]);
        });
    });

    // a sentry the CLI runs sends transactions of its own
    describe("on an account the node or the CLI sends from", () => {
        it.each([
            [
                0,
                "devnet account 0 signs the node's claims, so it can't also run a sentry",
            ],
            [
                6,
                "devnet account 6 signs the node's PRT transactions, so it can't also run a sentry",
            ],
        ])("should fail for devnet account %i", (index, reason) => {
            expect(() =>
                resolveSentries({
                    sentries: [sling({ address: devnet(index) })],
                }),
            ).toThrowError(
                new InvalidPrtConfigError(reason, "prt.sentries[1]"),
            );
        });

        it("should warn for the default sender of send and deposit", () => {
            const { warnings } = resolveSentries({
                sentries: [sling({ address: devnet(8) })],
            });

            expect(warnings).toEqual([
                "prt.sentries[1] is devnet account 8, the default sender of cartesi send and deposit; their transactions may collide",
            ]);
        });

        it("should warn for the guardian, devnet or not", () => {
            expect(
                resolveSentries(
                    { sentries: [sling({ address: DEVNET_GUARDIAN })] },
                    { guardian: DEVNET_GUARDIAN },
                ).warnings,
            ).toEqual([
                "prt.sentries[1] is the guardian of the application; its transactions may collide with an emergency withdrawal",
            ]);
            expect(
                resolveSentries(
                    { sentries: [sling({ privateKeyFile: keyFile(ownKey) })] },
                    { guardian: ownAddress },
                ).warnings,
            ).toEqual([
                "prt.sentries[1] is the guardian of the application; its transactions may collide with an emergency withdrawal",
            ]);
        });

        it("should accept an appointed-only entry on any account", () => {
            const { warnings } = resolveSentries(
                { sentries: [{ address: devnet(0) }, { address: devnet(1) }] },
                { guardian: devnet(1) },
            );

            expect(warnings).toEqual([]);
        });
    });
});

describe("readSentryKeyFile", () => {
    const bare = ownKey.slice(2);

    it.each([
        ["with 0x", ownKey],
        ["without 0x", bare],
        ["with a trailing newline", `${ownKey}\n`],
        ["with surrounding whitespace", `  ${bare}\t\n`],
        ["with more lines after the key", `${ownKey}\nsecond line\n`],
    ])("should read a key %s", (_, content) => {
        expect(readSentryKeyFile(keyFile(content), "prt.sentries[1]")).toBe(
            ownKey,
        );
    });

    it.each([
        [
            "a mnemonic",
            "test test test test test test test test test test test junk",
        ],
        ["a short key", "0x1234"],
        ["an empty file", ""],
        ["a key on the second line", `\n${ownKey}`],
    ])("should reject %s without printing it", (_, content) => {
        const file = keyFile(content);

        expect(() => readSentryKeyFile(file, "prt.sentries[1]")).toThrowError(
            new InvalidPrtConfigError(
                `the first line of private_key_file "${file}" must be a hex private key, 64 hex digits with or without 0x`,
                "prt.sentries[1]",
            ),
        );
    });

    it("should fail for a file that can't be read", () => {
        const file = path.join(dir, "missing.key");

        expect(() => readSentryKeyFile(file, "prt.sentries[2]")).toThrowError(
            new InvalidPrtConfigError(
                `private_key_file "${file}" can't be read`,
                "prt.sentries[2]",
            ),
        );
    });
});

describe("checkSentries", () => {
    const fakeClient = (balances: Record<string, bigint> = {}) => {
        const calls: { method: string; address: Address; value?: bigint }[] =
            [];
        const client: SentryClient = {
            getBalance: async ({ address }) => {
                calls.push({ method: "getBalance", address });
                return balances[address] ?? 0n;
            },
            setBalance: async ({ address, value }) => {
                calls.push({ method: "setBalance", address, value });
            },
        };
        return { calls, client };
    };

    it("should fund the pool sentries only, with what anvil gives its accounts", async () => {
        const { calls, client } = fakeClient({ [devnet(2)]: 1n });
        const prt = resolveSentries({
            sentries: [
                sling(),
                sling({ address: devnet(2) }),
                { address: external },
            ],
        });

        await checkSentries(client, prt);

        expect(SENTRY_FUNDING).toBe(10_000n * 10n ** 18n);
        expect(calls).toEqual([
            {
                method: "setBalance",
                address: devnet(20),
                value: SENTRY_FUNDING,
            },
            { method: "getBalance", address: devnet(2) },
        ]);
    });

    it("should fail for a sentry of the developer's own with no ETH", async () => {
        const { client } = fakeClient();
        const prt = resolveSentries({
            sentries: [sling({ privateKeyFile: keyFile(ownKey) })],
        });

        expect(checkSentries(client, prt)).rejects.toThrowError(
            `sentry 1 ${ownAddress} has no ETH on this devnet; fund it before cartesi run, e.g. with cast rpc anvil_setBalance`,
        );
    });

    it("should do nothing without sentries to run", async () => {
        const { calls, client } = fakeClient();

        await checkSentries(
            client,
            resolveSentries({ sentries: [{ address: external }] }),
        );

        expect(calls).toEqual([]);
    });
});

describe("describeSentry", () => {
    const describe_ = (sentries: PrtSentry[], index = 0) =>
        describeSentry(resolveSentries({ sentries }).sentries[index]);

    it("should name a pool account as funded by the CLI", () => {
        expect(describe_([sling()])).toBe(
            `sentry 1 ${devnet(20)} (devnet account 20, funded by the CLI)`,
        );
    });

    it("should name another devnet account", () => {
        expect(describe_([sling({ address: devnet(2), label: "two" })])).toBe(
            `sentry two ${devnet(2)} (devnet account 2)`,
        );
    });

    it("should name the key file of the developer's own sentry", () => {
        const file = keyFile(ownKey, "sentry.key");

        expect(describe_([sling({ privateKeyFile: file })])).toBe(
            `sentry 1 ${ownAddress} (key in ${file})`,
        );
    });

    it("should tell a sentry that is appointed only", () => {
        expect(describe_([sling(), { address: external }], 1)).toBe(
            `sentry 2 ${external} (appointed only)`,
        );
    });
});
