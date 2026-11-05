import { describe, expect, it } from "bun:test";
import { DEVNET_MNEMONIC } from "../../src/compose/node";
import type { Address } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import {
    DEFAULT_SENDER_INDEX,
    findMnemonicAccountIndex,
    getDefaultSender,
} from "../../src/wallet";

describe("findMnemonicAccountIndex", () => {
    it("should find the index of a devnet account", () => {
        expect(
            findMnemonicAccountIndex({
                address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
                mnemonic: DEVNET_MNEMONIC,
            }),
        ).toBe(1);
    });

    it("should match regardless of the address checksum", () => {
        expect(
            findMnemonicAccountIndex({
                address: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
                mnemonic: DEVNET_MNEMONIC,
            }),
        ).toBe(1);
    });

    it("should return undefined for an address not derived from the mnemonic", () => {
        expect(
            findMnemonicAccountIndex({
                address: "0x1234567890abcdef1234567890abcdef12345678",
                max: 3,
                mnemonic: DEVNET_MNEMONIC,
            }),
        ).toBeUndefined();
    });

    it("should only look at the first accounts", () => {
        // 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC is the account at index 2
        expect(
            findMnemonicAccountIndex({
                address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
                max: 2,
                mnemonic: DEVNET_MNEMONIC,
            }),
        ).toBeUndefined();
    });
});

describe("getDefaultSender", () => {
    const devnetAddresses = (count: number): Address[] =>
        Array.from(
            { length: count },
            (_, addressIndex) =>
                mnemonicToAccount(DEVNET_MNEMONIC, { addressIndex }).address,
        );
    const client = (addresses: Address[]) => ({
        getAddresses: async () => addresses,
    });

    it("should be devnet account 8", async () => {
        expect(DEFAULT_SENDER_INDEX).toBe(8);
        expect(await getDefaultSender(client(devnetAddresses(10)))).toBe(
            "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
        );
    });

    it("should ask for --from when the RPC exposes too few accounts", async () => {
        await expect(
            getDefaultSender(client(devnetAddresses(8))),
        ).rejects.toThrow(
            "The RPC exposes 8 accounts, so there is no devnet account 8 to send from; pass --from to choose the sender",
        );
    });
});
