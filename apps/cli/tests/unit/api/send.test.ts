import { describe, expect, it } from "bun:test";
import { encodeAbiParameters, parseAbiParameters, stringToHex } from "viem";
import { encodeInput } from "../../../src/api/send.js";

describe("api/send", () => {
    describe("encodeInput", () => {
        it("should return undefined for an empty input", async () => {
            expect(await encodeInput(undefined, {})).toBeUndefined();
            expect(await encodeInput("", {})).toBeUndefined();
        });

        it("should assume hex when the input starts with 0x", async () => {
            expect(await encodeInput("0xdeadbeef", {})).toBe("0xdeadbeef");
        });

        it("should encode as an UTF-8 string by default", async () => {
            expect(await encodeInput("hello", {})).toBe(stringToHex("hello"));
        });

        it("should encode as an UTF-8 string when requested", async () => {
            expect(
                await encodeInput("0xdeadbeef", { encoding: "string" }),
            ).toBe(stringToHex("0xdeadbeef"));
        });

        it("should validate a hex encoded input", async () => {
            expect(
                encodeInput("deadbeef", { encoding: "hex" }),
            ).rejects.toThrow("input encoded as hex must start with 0x");
        });

        it("should encode abi parameters", async () => {
            const abiParams = "address,uint256,bool,string";
            const encoded = await encodeInput(
                "0x1111111111111111111111111111111111111111,42,true,hello",
                { abiParams, encoding: "abi" },
            );
            expect(encoded).toBe(
                encodeAbiParameters(parseAbiParameters(abiParams), [
                    "0x1111111111111111111111111111111111111111",
                    42n,
                    true,
                    "hello",
                ]),
            );
        });

        it("should encode packed abi parameters", async () => {
            const encoded = await encodeInput("42,hello", {
                abiParams: "uint256,string",
                encoding: "abi-packed",
            });
            expect(encoded).toBe(
                `0x${42n.toString(16).padStart(64, "0")}${stringToHex("hello").slice(2)}`,
            );
        });

        it("should require abi params for abi encodings", async () => {
            expect(encodeInput("42", { encoding: "abi" })).rejects.toThrow(
                "Undefined input-abi-params",
            );
        });

        it("should validate the number of abi values", async () => {
            expect(
                encodeInput("42", {
                    abiParams: "uint256,string",
                    encoding: "abi",
                }),
            ).rejects.toThrow("Not enough values");

            expect(
                encodeInput("42,hello", {
                    abiParams: "uint256",
                    encoding: "abi",
                }),
            ).rejects.toThrow("Too many values");
        });

        it("should validate abi values", async () => {
            expect(
                encodeInput("nan", { abiParams: "uint256", encoding: "abi" }),
            ).rejects.toThrow("Invalid uint value: nan");

            expect(
                encodeInput("yes", { abiParams: "bool", encoding: "abi" }),
            ).rejects.toThrow("Invalid boolean value: yes");

            expect(
                encodeInput("0x00", { abiParams: "address", encoding: "abi" }),
            ).rejects.toThrow("Invalid address value: 0x00");

            expect(
                encodeInput("nothex", { abiParams: "bytes", encoding: "abi" }),
            ).rejects.toThrow("Invalid bytes value: nothex");
        });
    });
});
