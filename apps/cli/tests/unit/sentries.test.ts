import { describe, expect, it } from "bun:test";
import type { Address } from "viem";
import { InvalidPrtConfigError, type PrtSentry } from "../../src/config";
import {
    describePrt,
    describeSentry,
    resolveSentries,
    SENTRY_POOL_SIZE,
    SENTRY_POOL_START,
} from "../../src/sentries";
import { getDevnetAccount } from "../../src/wallet";

const devnet = (index: number) => getDevnetAccount(index).address;
const external: Address = "0x4444444444444444444444444444444444444444";
const external2: Address = "0x5555555555555555555555555555555555555555";
const sling = (sentry: Omit<PrtSentry, "type"> = {}): PrtSentry => ({
    type: "sling",
    ...sentry,
});

describe("resolveSentries", () => {
    it("should give bare entries the pool accounts in order", () => {
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
                sling({ address: external }),
                { address: devnet(25) },
                { address: external2 },
            ],
        });

        expect(
            sentries.map(({ address, source }) => [address, source]),
        ).toEqual([
            [devnet(2), { kind: "devnet", index: 2 }],
            [external, { kind: "external" }],
            [devnet(25), { kind: "pool", index: 25 }],
            [external2, { kind: "external" }],
        ]);
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
});

describe("describePrt", () => {
    it("should print the manager before the sentries", () => {
        expect(
            describePrt(
                resolveSentries({
                    sentryManager: devnet(5),
                    sentries: [sling()],
                }),
            ),
        ).toEqual([
            `sentry manager ${devnet(5)}`,
            `sentry 1 ${devnet(20)} (devnet account 20)`,
        ]);
    });

    // without a manager the slots are fixed for the life of the consensus
    it("should say when there is no manager", () => {
        expect(describePrt(resolveSentries({ sentries: [sling()] }))[0]).toBe(
            "sentry manager none (the sentries can't be rotated)",
        );
    });

    // a manager with no sentries only gets the warning
    it("should print nothing without sentries", () => {
        expect(
            describePrt(
                resolveSentries({ sentryManager: devnet(5), sentries: [] }),
            ),
        ).toEqual([]);
    });
});

describe("describeSentry", () => {
    const describe_ = (sentries: PrtSentry[], index = 0) =>
        describeSentry(resolveSentries({ sentries }).sentries[index]);

    it("should name a pool account", () => {
        expect(describe_([sling()])).toBe(
            `sentry 1 ${devnet(20)} (devnet account 20)`,
        );
    });

    it("should name another devnet account", () => {
        expect(describe_([sling({ address: devnet(2), label: "two" })])).toBe(
            `sentry two ${devnet(2)} (devnet account 2)`,
        );
    });

    it("should tell an account of the developer's own", () => {
        expect(describe_([sling({ address: external })])).toBe(
            `sentry 1 ${external} (your account)`,
        );
    });

    it("should tell a sentry that is appointed only", () => {
        expect(describe_([sling(), { address: external }], 1)).toBe(
            `sentry 2 ${external} (appointed only)`,
        );
    });
});
