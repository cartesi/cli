import { describe, expect, it } from "bun:test";
import { parseAccountIndex } from "../../src/node";

describe("parseAccountIndex", () => {
    it("should parse a non-negative integer", () => {
        expect(parseAccountIndex("0")).toBe(0);
        expect(parseAccountIndex("3")).toBe(3);
    });

    it("should reject anything else", () => {
        expect(() => parseAccountIndex("-1")).toThrow();
        expect(() => parseAccountIndex("1.5")).toThrow();
        expect(() => parseAccountIndex("one")).toThrow();
    });
});
