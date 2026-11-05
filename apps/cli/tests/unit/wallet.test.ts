import { describe, expect, it } from "bun:test";
import { DEVNET_MNEMONIC } from "../../src/compose/node";
import type { Address } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import {
    DEFAULT_SENDER_INDEX,
    DEVNET_ACCOUNTS,
    findMnemonicAccountIndex,
    getDefaultSender,
    getDevnetAccount,
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

describe("getDevnetAccount", () => {
    it("should derive the address and key of a devnet account", () => {
        const account = mnemonicToAccount(DEVNET_MNEMONIC, {
            addressIndex: 20,
        });

        expect(getDevnetAccount(20)).toEqual({
            address: account.address,
            privateKey: `0x${Buffer.from(account.getHdKey().privateKey as Uint8Array).toString("hex")}`,
        });
    });

    it("should be the account anvil funds for the first indexes", () => {
        expect(getDevnetAccount(0).address).toBe(
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        );
        expect(getDevnetAccount(0).privateKey).toBe(
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        );
    });

    it.each([-1, 1.5, DEVNET_ACCOUNTS])(
        "should fail for the index %s",
        (index) => {
            expect(() => getDevnetAccount(index)).toThrow(
                `There is no devnet account ${index}, the CLI derives accounts 0 to ${DEVNET_ACCOUNTS - 1}`,
            );
        },
    );
});
