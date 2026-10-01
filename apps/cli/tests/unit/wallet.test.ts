import { describe, expect, it } from "bun:test";
import { DEVNET_MNEMONIC } from "../../src/compose/node";
import { findMnemonicAccountIndex } from "../../src/wallet";

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
