import { describe, expect, it } from "bun:test";
import { parseEther } from "viem";
import {
    DepositError,
    InsufficientBalanceError,
    InvalidAmountError,
    parseAmount,
    TokenNotFoundError,
} from "../../../src/api/deposit/index.js";

describe("api/deposit", () => {
    describe("parseAmount", () => {
        it("should take a bigint as base units", () => {
            expect(parseAmount(42n, 18)).toBe(42n);
            expect(parseAmount(0n, 6)).toBe(0n);
        });

        it("should take a string as display units", () => {
            expect(parseAmount("1.5", 18)).toBe(parseEther("1.5"));
            expect(parseAmount("2", 6)).toBe(2_000_000n);
        });

        it("should take a string as an integer when there are no decimals", () => {
            expect(parseAmount("42", 0)).toBe(42n);
        });
    });

    describe("errors", () => {
        it("should all be deposit errors", () => {
            expect(new InsufficientBalanceError()).toBeInstanceOf(DepositError);
            expect(new InvalidAmountError("too small")).toBeInstanceOf(
                DepositError,
            );
            expect(new TokenNotFoundError("no token")).toBeInstanceOf(
                DepositError,
            );
        });

        it("should have a default message for an insufficient balance", () => {
            expect(new InsufficientBalanceError().message).toBe(
                "Insufficient balance",
            );
            expect(
                new InsufficientBalanceError(
                    "Insufficient balance for token ID 1",
                ).message,
            ).toBe("Insufficient balance for token ID 1");
        });
    });
});
