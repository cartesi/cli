import { describe, expect, it } from "bun:test";
import {
    InvalidBytesValueError,
    parseSize,
} from "../../../src/config/index.js";

describe("parseSize", () => {
    it("should take a number of bytes as is", () => {
        expect(parseSize(0)).toBe(0);
        expect(parseSize(128)).toBe(128);
        expect(parseSize(128n)).toBe(128);
        expect(parseSize("128")).toBe(128);
    });

    it("should parse the decimal looking units as binary multiples", () => {
        expect(parseSize("1kb")).toBe(1024);
        expect(parseSize("128MB")).toBe(128 * 1024 ** 2);
        expect(parseSize("2Gb")).toBe(2 * 1024 ** 3);
    });

    it("should parse the IEC units", () => {
        // 'bytes.parse' reads these as a plain number of bytes, which silently
        // makes a drive several orders of magnitude too small
        expect(parseSize("64Mi")).toBe(64 * 1024 ** 2);
        expect(parseSize("64MiB")).toBe(64 * 1024 ** 2);
        expect(parseSize("1Ki")).toBe(1024);
    });

    it("should parse a unit with no prefix", () => {
        expect(parseSize("512b")).toBe(512);
        expect(parseSize("4M")).toBe(4 * 1024 ** 2);
    });

    it("should accept fractions and spacing", () => {
        expect(parseSize("1.5Mb")).toBe(Math.floor(1.5 * 1024 ** 2));
        expect(parseSize(" 10 Mb ")).toBe(10 * 1024 ** 2);
    });

    it("should reject anything it does not understand", () => {
        expect(() => parseSize("abc")).toThrowError(
            new InvalidBytesValueError("abc"),
        );
        expect(() => parseSize("64Xy")).toThrowError(
            new InvalidBytesValueError("64Xy"),
        );
        expect(() => parseSize("")).toThrowError(
            new InvalidBytesValueError(""),
        );
        expect(() => parseSize(undefined)).toThrowError(
            new InvalidBytesValueError(undefined),
        );
        expect(() => parseSize({})).toThrowError(
            new InvalidBytesValueError({}),
        );
    });
});
