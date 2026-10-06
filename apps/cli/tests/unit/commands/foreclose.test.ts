import { describe, expect, it } from "bun:test";
import { zeroAddress } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { resolveForecloseSigner } from "../../../src/commands/foreclose";
import { DEVNET_MNEMONIC } from "../../../src/compose/node";

// account 1 of the devnet mnemonic
const guardian = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
// its private key, a well known anvil account
const guardianKey =
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const node = { kind: "mnemonic", mnemonic: DEVNET_MNEMONIC } as const;
const nodePrivateKey = { kind: "private_key" } as const;
const otherMnemonic =
    "legal winner thank year wave sausage worth useful legal winner thank yellow";
const otherGuardian = mnemonicToAccount(otherMnemonic, {
    addressIndex: 2,
}).address;

describe("resolveForecloseSigner", () => {
    it("should reject an application without a withdrawal config", () => {
        expect(() =>
            resolveForecloseSigner({ guardian: zeroAddress, node }),
        ).toThrow("without a withdrawal config");
    });

    describe("with the node signer", () => {
        it("should look up the guardian in the node mnemonic", () => {
            expect(resolveForecloseSigner({ guardian, node })).toEqual({
                accountIndex: 1,
                env: undefined,
            });
        });

        it("should use the given account index without a lookup", () => {
            expect(
                resolveForecloseSigner({ accountIndex: 25, guardian, node }),
            ).toEqual({ accountIndex: 25, env: undefined });
        });

        it("should explain how to sign as a guardian it can't find", () => {
            expect(() =>
                resolveForecloseSigner({ guardian: otherGuardian, node }),
            ).toThrow(
                /CARTESI_AUTH_MNEMONIC.*--account-index.*CARTESI_AUTH_PRIVATE_KEY/,
            );
        });

        it("should sign with a private key as configured", () => {
            expect(
                resolveForecloseSigner({ guardian, node: nodePrivateKey }),
            ).toEqual({});
        });

        it("should warn that the index is ignored for a private key", () => {
            const result = resolveForecloseSigner({
                accountIndex: 3,
                guardian,
                node: nodePrivateKey,
            });
            expect(result.accountIndex).toBeUndefined();
            expect(result.warning).toContain("ignored");
        });
    });

    describe("with a signer for the command", () => {
        it("should look up the guardian in that mnemonic", () => {
            expect(
                resolveForecloseSigner({
                    guardian: otherGuardian,
                    host: { kind: "mnemonic", mnemonic: otherMnemonic },
                    node,
                }),
            ).toEqual({
                accountIndex: 2,
                env: {
                    CARTESI_AUTH_KIND: "mnemonic",
                    CARTESI_AUTH_MNEMONIC: otherMnemonic,
                },
            });
        });

        it("should take precedence over the node signer", () => {
            expect(() =>
                resolveForecloseSigner({
                    guardian,
                    host: { kind: "mnemonic", mnemonic: otherMnemonic },
                    node,
                }),
            ).toThrow("isn't one of the first 20 accounts");
        });

        it("should sign with the guardian's private key", () => {
            expect(
                resolveForecloseSigner({
                    guardian,
                    host: { kind: "private_key", privateKey: guardianKey },
                }),
            ).toEqual({
                env: {
                    CARTESI_AUTH_KIND: "private_key",
                    CARTESI_AUTH_PRIVATE_KEY: guardianKey,
                },
            });
        });

        it("should reject a private key that isn't the guardian", () => {
            expect(() =>
                resolveForecloseSigner({
                    guardian: otherGuardian,
                    host: { kind: "private_key", privateKey: guardianKey },
                }),
            ).toThrow("isn't the guardian");
        });

        it("should warn that the index is ignored for a private key", () => {
            const result = resolveForecloseSigner({
                accountIndex: 3,
                guardian,
                host: { kind: "private_key", privateKey: guardianKey },
            });
            expect(result.accountIndex).toBeUndefined();
            expect(result.warning).toContain("ignored");
        });
    });
});
