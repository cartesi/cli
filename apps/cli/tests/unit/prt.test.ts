import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { InvalidPrtConfigError, type PrtNode } from "../../src/config";
import {
    checkPrtNodes,
    claimerMoved,
    claimerOf,
    describePrtNode,
    PRT_FUNDING,
    PRT_POOL_SIZE,
    PRT_POOL_START,
    type PrtClient,
    readKeyFile,
    resolvePrtNodes,
    sentriesOf,
} from "../../src/prt";
import { getDevnetAccount } from "../../src/wallet";
import { DEVNET_GUARDIAN } from "../../src/withdrawal";

const devnet = (index: number) => getDevnetAccount(index).address;
const external: Address = "0x4444444444444444444444444444444444444444";
const sling = (node: Partial<PrtNode> = {}): PrtNode => ({
    type: "sling",
    role: "sentry",
    ...node,
});
const appointed = (address: Address): PrtNode => ({ role: "sentry", address });
const claimer = (node: Partial<PrtNode> = {}): PrtNode => ({
    type: "sling",
    role: "claimer",
    ...node,
});
const resolve = (
    nodes: Record<string, PrtNode>,
    options?: { guardian?: Address },
) => resolvePrtNodes({ nodes }, options);

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
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "prt-"));
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("resolvePrtNodes", () => {
    it("should give bare entries the pool accounts in file order, with their keys", () => {
        const { nodes } = resolve({ a: sling(), b: sling(), c: sling() });

        expect(nodes.map(({ address }) => address)).toEqual([
            devnet(20),
            devnet(21),
            devnet(22),
        ]);
        expect(nodes.map(({ source }) => source)).toEqual([
            { kind: "pool", index: 20 },
            { kind: "pool", index: 21 },
            { kind: "pool", index: 22 },
        ]);
        expect(nodes.map(({ privateKey }) => privateKey)).toEqual([
            getDevnetAccount(20).privateKey,
            getDevnetAccount(21).privateKey,
            getDevnetAccount(22).privateKey,
        ]);
    });

    it("should start the pool after the accounts anvil funds", () => {
        expect(PRT_POOL_START).toBe(20);
        expect(PRT_POOL_SIZE).toBe(10);
    });

    // an entry that names a pool account keeps it, so the pool must not hand
    // the same account to a bare entry, wherever the two are
    it("should skip a pool account another entry names", () => {
        const { nodes } = resolve({
            a: sling(),
            b: sling({ address: devnet(21) }),
            c: sling(),
        });

        expect(nodes.map(({ address }) => address)).toEqual([
            devnet(20),
            devnet(21),
            devnet(22),
        ]);
    });

    it("should skip a pool account named later in the config", () => {
        const { nodes } = resolve({ a: sling(), b: appointed(devnet(20)) });

        expect(nodes.map(({ address }) => address)).toEqual([
            devnet(21),
            devnet(20),
        ]);
    });

    it("should fail naming the entry when the pool runs out", () => {
        const nodes = Object.fromEntries(
            Array.from({ length: PRT_POOL_SIZE + 1 }, (_, i) => [
                `n${i + 1}`,
                sling(),
            ]),
        );

        expect(() => resolve(nodes)).toThrowError(
            new InvalidPrtConfigError(
                "needs an address: the PRT pool, devnet accounts 20 to 29, is used up",
                "[prt.nodes.n11]",
            ),
        );
    });

    it("should keep explicit addresses and tell devnet accounts from others", () => {
        const { nodes } = resolve({
            a: sling({ address: devnet(2) }),
            b: appointed(devnet(25)),
            c: appointed(external),
        });

        expect(
            nodes.map(({ address, privateKey, source }) => [
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
        expect(() => resolve({ a: sling({ address: external }) })).toThrowError(
            new InvalidPrtConfigError(
                `the CLI has no key for ${external}: set private_key_file to run the node with it, or drop the type to appoint it only`,
                "[prt.nodes.a]",
            ),
        );
    });

    // the ID on the consensus is the position among the sentries
    it("should number the sentries in file order, labelled by their keys", () => {
        const { nodes } = resolve({
            first: sling(),
            theirs: appointed(external),
            last: sling(),
        });

        expect(nodes.map(({ label, sentryId }) => [label, sentryId])).toEqual([
            ["first", 1],
            ["theirs", 2],
            ["last", 3],
        ]);
        expect(sentriesOf({ nodes, warnings: [] })).toEqual(nodes);
    });

    it("should carry the type, the role and the manager", () => {
        const resolved = resolvePrtNodes({
            sentryManager: devnet(5),
            nodes: { a: sling(), b: appointed(external) },
        });

        expect(resolved.sentryManager).toBe(devnet(5));
        expect(resolved.nodes.map(({ role, type }) => [role, type])).toEqual([
            ["sentry", "sling"],
            ["sentry", undefined],
        ]);
        expect(resolved.warnings).toEqual([]);
    });

    it("should warn about a manager with no sentries to rotate", () => {
        const { warnings } = resolvePrtNodes({
            sentryManager: devnet(5),
            nodes: {},
        });

        expect(warnings).toEqual([
            "[prt].sentry_manager is set but no [prt.nodes] entry is a sentry, so the manager has no sentries to rotate",
        ]);
    });

    describe("with a key file", () => {
        it("should take the address from the key, without one in the entry", () => {
            const file = keyFile(ownKey);
            const { nodes } = resolve({
                mine: sling({ privateKeyFile: file }),
            });

            expect(nodes[0]).toEqual({
                label: "mine",
                address: ownAddress,
                type: "sling",
                role: "sentry",
                sentryId: 1,
                source: { kind: "key-file", path: file },
            });
            // the key stays in the file: the init service copies it
            expect(nodes[0].privateKey).toBeUndefined();
        });

        it("should accept an address that matches the key", () => {
            const { nodes } = resolve({
                mine: sling({
                    address: ownAddress,
                    privateKeyFile: keyFile(ownKey),
                }),
            });

            expect(nodes[0].address).toBe(ownAddress);
        });

        it("should fail for an address the key doesn't match, naming both", () => {
            const file = keyFile(ownKey);

            expect(() =>
                resolve({
                    mine: sling({ address: external, privateKeyFile: file }),
                }),
            ).toThrowError(
                new InvalidPrtConfigError(
                    `private_key_file "${file}" is the key of ${ownAddress}, not ${external}`,
                    "[prt.nodes.mine]",
                ),
            );
        });

        // the devnet keys are public and derived by the CLI itself
        it("should fail for the key of a devnet account", () => {
            const file = keyFile(getDevnetAccount(3).privateKey);

            expect(() =>
                resolve({ mine: sling({ privateKeyFile: file }) }),
            ).toThrowError(
                new InvalidPrtConfigError(
                    `private_key_file "${file}" holds the key of devnet account 3, which the CLI derives itself. Drop the file, or set the address instead`,
                    "[prt.nodes.mine]",
                ),
            );
        });

        // a key file's address is known only after reading it
        it("should fail when a key file repeats the address of another entry", () => {
            expect(() =>
                resolve({
                    theirs: appointed(ownAddress),
                    mine: sling({ privateKeyFile: keyFile(ownKey) }),
                }),
            ).toThrowError(
                new InvalidPrtConfigError(
                    `address ${ownAddress} is also the address of [prt.nodes.theirs]`,
                    "[prt.nodes.mine]",
                ),
            );
        });

        it("should skip a pool account only when an entry names it", () => {
            const { nodes } = resolve({
                mine: sling({ privateKeyFile: keyFile(ownKey) }),
                a: sling(),
            });

            expect(nodes.map(({ address }) => address)).toEqual([
                ownAddress,
                devnet(20),
            ]);
        });
    });

    // a node the CLI runs sends transactions of its own
    describe("on an account the node or the CLI sends from", () => {
        it.each([
            [
                0,
                "devnet account 0 signs the node's claims, so it can't also run [prt.nodes.a]",
            ],
            [
                6,
                "devnet account 6 signs the node's PRT transactions, so it can't also run [prt.nodes.a]",
            ],
        ])("should fail for devnet account %i", (index, reason) => {
            expect(() =>
                resolve({ a: sling({ address: devnet(index) }) }),
            ).toThrowError(new InvalidPrtConfigError(reason, "[prt.nodes.a]"));
        });

        it("should warn for the default sender of send and deposit", () => {
            const { warnings } = resolve({ a: sling({ address: devnet(8) }) });

            expect(warnings).toEqual([
                "[prt.nodes.a] is devnet account 8, the default sender of cartesi send and deposit, so their transactions may collide",
            ]);
        });

        it("should warn for the guardian, devnet or not", () => {
            expect(
                resolve(
                    { a: sling({ address: DEVNET_GUARDIAN }) },
                    { guardian: DEVNET_GUARDIAN },
                ).warnings,
            ).toEqual([
                "[prt.nodes.a] is the guardian of the application, so its transactions may collide with an emergency withdrawal",
            ]);
            expect(
                resolve(
                    { a: sling({ privateKeyFile: keyFile(ownKey) }) },
                    { guardian: ownAddress },
                ).warnings,
            ).toEqual([
                "[prt.nodes.a] is the guardian of the application, so its transactions may collide with an emergency withdrawal",
            ]);
        });

        it("should accept an appointed-only entry on any account", () => {
            const { warnings } = resolve(
                { a: appointed(devnet(0)), b: appointed(devnet(1)) },
                { guardian: devnet(1) },
            );

            expect(warnings).toEqual([]);
        });
    });
});

// a sling node that claims, with the rollups-node reading
describe("with a claimer", () => {
    it("should draw the claimer from the pool like any entry, in file order", () => {
        const resolved = resolve({ a: sling(), blue: claimer(), b: sling() });

        expect(
            resolved.nodes.map(({ label, address, sentryId }) => [
                label,
                address,
                sentryId,
            ]),
        ).toEqual([
            ["a", devnet(20), 1],
            ["blue", devnet(21), undefined],
            ["b", devnet(22), 2],
        ]);
        expect(claimerOf(resolved)?.label).toBe("blue");
        expect(sentriesOf(resolved).map(({ label }) => label)).toEqual([
            "a",
            "b",
        ]);
    });

    it("should have no claimer when the rollups-node claims", () => {
        expect(claimerOf(resolve({ a: sling() }))).toBeUndefined();
    });

    it("should take the claimer's key from a file", () => {
        const file = keyFile(ownKey);
        const { nodes } = resolve({ blue: claimer({ privateKeyFile: file }) });

        expect(nodes[0]).toEqual({
            label: "blue",
            address: ownAddress,
            type: "sling",
            role: "claimer",
            source: { kind: "key-file", path: file },
        });
    });

    // the node has a PRT signer only when it claims
    it("should free devnet account 6 when a sling node claims", () => {
        expect(
            resolve({ blue: claimer({ address: devnet(6) }) }).warnings,
        ).toEqual([]);
        expect(() =>
            resolve({ a: sling({ address: devnet(6) }) }),
        ).toThrowError(
            "devnet account 6 signs the node's PRT transactions, so it can't also run [prt.nodes.a]",
        );
    });

    it("should still reserve devnet account 0 for the node", () => {
        expect(() =>
            resolve({ blue: claimer({ address: devnet(0) }) }),
        ).toThrowError(
            "devnet account 0 signs the node's claims, so it can't also run [prt.nodes.blue]",
        );
    });

    it("should fund the claimer with the pool", async () => {
        const calls: { address: Address; value: bigint }[] = [];
        const client: PrtClient = {
            getBalance: async () => 1n,
            setBalance: async ({ address, value }) => {
                calls.push({ address, value });
            },
        };

        await checkPrtNodes(client, resolve({ blue: claimer() }));

        expect(calls).toEqual([{ address: devnet(20), value: PRT_FUNDING }]);
    });

    it("should describe the claimer without a sentry ID", () => {
        expect(describePrtNode(resolve({ blue: claimer() }).nodes[0])).toBe(
            `claimer blue ${devnet(20)} (devnet account 20, funded by the CLI)`,
        );
    });

    // the node's mode is saved in its database at the first start
    describe("claimerMoved", () => {
        const nodeClaims = resolve({ a: sling() });
        const blueClaims = resolve({ a: sling(), blue: claimer() });
        const redClaims = resolve({ a: sling(), red: claimer() });

        it("should accept the same placement", () => {
            expect(claimerMoved(undefined, undefined)).toBeUndefined();
            expect(claimerMoved(nodeClaims, nodeClaims)).toBeUndefined();
            expect(claimerMoved(blueClaims, blueClaims)).toBeUndefined();
            expect(
                claimerMoved(nodeClaims, resolve({ b: sling() })),
            ).toBeUndefined();
        });

        it("should warn when the claimer moves to an entry", () => {
            expect(claimerMoved(nodeClaims, blueClaims)).toBe(
                "the claimer moved to [prt.nodes.blue] in cartesi.toml. Restart cartesi run to apply it. This rebuild keeps the [prt] setup it started with.",
            );
            expect(claimerMoved(undefined, blueClaims)).toBe(
                "the claimer moved to [prt.nodes.blue] in cartesi.toml. Restart cartesi run to apply it. This rebuild keeps the [prt] setup it started with.",
            );
        });

        it("should warn when the claimer moves back to the node", () => {
            expect(claimerMoved(blueClaims, nodeClaims)).toBe(
                "the claimer moved back to the rollups-node in cartesi.toml. Restart cartesi run to apply it. This rebuild keeps the [prt] setup it started with.",
            );
        });

        it("should warn when the claimer moves between entries", () => {
            expect(claimerMoved(blueClaims, redClaims)).toBe(
                "the claimer moved to [prt.nodes.red] in cartesi.toml. Restart cartesi run to apply it. This rebuild keeps the [prt] setup it started with.",
            );
        });
    });
});

describe("readKeyFile", () => {
    const bare = ownKey.slice(2);

    it.each([
        ["with 0x", ownKey],
        ["without 0x", bare],
        ["with a trailing newline", `${ownKey}\n`],
        ["with surrounding whitespace", `  ${bare}\t\n`],
        ["with more lines after the key", `${ownKey}\nsecond line\n`],
    ])("should read a key %s", (_, content) => {
        expect(readKeyFile(keyFile(content), "[prt.nodes.mine]")).toBe(ownKey);
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

        expect(() => readKeyFile(file, "[prt.nodes.mine]")).toThrowError(
            new InvalidPrtConfigError(
                `the first line of private_key_file "${file}" must be a hex private key, 64 hex digits with or without 0x`,
                "[prt.nodes.mine]",
            ),
        );
    });

    it("should fail for a file that can't be read", () => {
        const file = path.join(dir, "missing.key");

        expect(() => readKeyFile(file, "[prt.nodes.mine]")).toThrowError(
            new InvalidPrtConfigError(
                `private_key_file "${file}" can't be read`,
                "[prt.nodes.mine]",
            ),
        );
    });
});

describe("checkPrtNodes", () => {
    const fakeClient = (balances: Record<string, bigint> = {}) => {
        const calls: { method: string; address: Address; value?: bigint }[] =
            [];
        const client: PrtClient = {
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

    it("should fund the pool accounts only, with what anvil gives its accounts", async () => {
        const { calls, client } = fakeClient({ [devnet(2)]: 1n });
        const prt = resolve({
            a: sling(),
            b: sling({ address: devnet(2) }),
            c: appointed(external),
        });

        await checkPrtNodes(client, prt);

        expect(PRT_FUNDING).toBe(10_000n * 10n ** 18n);
        expect(calls).toEqual([
            {
                method: "setBalance",
                address: devnet(20),
                value: PRT_FUNDING,
            },
            { method: "getBalance", address: devnet(2) },
        ]);
    });

    it("should fail for a node of the developer's own with no ETH", async () => {
        const { client } = fakeClient();
        const prt = resolve({
            mine: sling({ privateKeyFile: keyFile(ownKey) }),
        });

        expect(checkPrtNodes(client, prt)).rejects.toThrowError(
            `sentry mine ${ownAddress} has no ETH on this devnet. Fund it before cartesi run, e.g. with cast rpc anvil_setBalance`,
        );
    });

    it("should do nothing without nodes to run", async () => {
        const { calls, client } = fakeClient();

        await checkPrtNodes(client, resolve({ a: appointed(external) }));

        expect(calls).toEqual([]);
    });
});

describe("describePrtNode", () => {
    const describe_ = (nodes: Record<string, PrtNode>, index = 0) =>
        describePrtNode(resolve(nodes).nodes[index]);

    it("should name a pool account as funded by the CLI", () => {
        expect(describe_({ a: sling() })).toBe(
            `sentry 1 a ${devnet(20)} (devnet account 20, funded by the CLI)`,
        );
    });

    it("should name another devnet account", () => {
        expect(describe_({ two: sling({ address: devnet(2) }) })).toBe(
            `sentry 1 two ${devnet(2)} (devnet account 2)`,
        );
    });

    it("should name the key file of the developer's own node", () => {
        const file = keyFile(ownKey, "sentry.key");

        expect(describe_({ mine: sling({ privateKeyFile: file }) })).toBe(
            `sentry 1 mine ${ownAddress} (key in ${file})`,
        );
    });

    it("should tell a sentry that is appointed only", () => {
        expect(describe_({ a: sling(), theirs: appointed(external) }, 1)).toBe(
            `sentry 2 theirs ${external} (appointed only)`,
        );
    });

    // what the CLI does comes first: a devnet address alone would read as
    // an entry the CLI runs
    it("should tell an appointed-only sentry on a devnet account", () => {
        expect(describe_({ theirs: appointed(devnet(3)) })).toBe(
            `sentry 1 theirs ${devnet(3)} (appointed only, devnet account 3)`,
        );
    });
});
