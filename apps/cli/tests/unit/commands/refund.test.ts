import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseInputIndex } from "../../../src/base";
import { getInputData } from "../../../src/commands/refund";

const application = "0x1234567890abcdef1234567890abcdef12345678";

describe("parseInputIndex", () => {
    it("should parse decimal and 0x-prefixed hexadecimal indexes", () => {
        expect(parseInputIndex("2")).toBe(2n);
        expect(parseInputIndex("0x2a")).toBe(42n);
    });

    it("should reject anything else", () => {
        for (const value of ["abc", "-1", "", "1.5", "0x"]) {
            expect(() => parseInputIndex(value)).toThrow(
                "Not a valid input index",
            );
        }
    });
});

describe("getInputData", () => {
    let dir: string;
    const file = (name: string, content: string) => {
        const filePath = path.join(dir, name);
        fs.writeFileSync(filePath, content);
        return filePath;
    };
    const unusedClient = {
        getInput: () => {
            throw new Error("the node must not be queried");
        },
    };

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "refund-"));
    });

    afterAll(() => {
        fs.rmSync(dir, { recursive: true });
    });

    it("should use the input file, trimmed, instead of the node", async () => {
        expect(
            await getInputData({
                application,
                client: unusedClient,
                inputFile: file("valid.hex", "  0xdeadbeef\n"),
                inputIndex: 2n,
            }),
        ).toBe("0xdeadbeef");
    });

    it("should reject an input file that isn't 0x-prefixed hex", async () => {
        for (const content of ["deadbeef", "0xnothex", "0x", ""]) {
            await expect(
                getInputData({
                    application,
                    client: unusedClient,
                    inputFile: file("invalid.hex", content),
                    inputIndex: 2n,
                }),
            ).rejects.toThrow("must contain the 0x-prefixed hexadecimal");
        }
    });

    it("should read the input from the node", async () => {
        const client = {
            getInput: async () => ({ rawData: "0xcafe" as const }),
        };
        expect(
            await getInputData({
                application,
                client: client as never,
                inputIndex: 2n,
            }),
        ).toBe("0xcafe");
    });

    it("should point to --input-file when the node doesn't have the input", async () => {
        const client = {
            getInput: async () => {
                throw new Error("not found");
            },
        };
        await expect(
            getInputData({
                application,
                client: client as never,
                inputIndex: 99n,
            }),
        ).rejects.toThrow(/Input 99 not found in the node, use .*--input-file/);
    });
});
