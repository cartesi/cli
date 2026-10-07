import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseInputIndex } from "../../../src/base";
import { getInputData } from "../../../src/commands/refund";
import { application } from "../fixtures";

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
    const unusedNode = {
        getNodeInput: () => {
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
                inputFile: file("valid.hex", "  0xdeadbeef\n"),
                inputIndex: 2n,
                io: unusedNode,
                projectName: "dapp",
            }),
        ).toBe("0xdeadbeef");
    });

    it("should reject an input file that isn't 0x-prefixed hex", async () => {
        for (const content of ["deadbeef", "0xnothex", "0x", ""]) {
            await expect(
                getInputData({
                    application,
                    inputFile: file("invalid.hex", content),
                    inputIndex: 2n,
                    io: unusedNode,
                    projectName: "dapp",
                }),
            ).rejects.toThrow("must contain the 0x-prefixed hexadecimal");
        }
    });

    it("should read the input from the node", async () => {
        expect(
            await getInputData({
                application,
                inputIndex: 2n,
                io: { getNodeInput: async () => "0xcafe" },
                projectName: "dapp",
            }),
        ).toBe("0xcafe");
    });

    it("should point to --input-file when the node doesn't have the input", async () => {
        const io = {
            getNodeInput: async () => {
                throw new Error("not found");
            },
        };
        await expect(
            getInputData({
                application,
                inputIndex: 99n,
                io,
                projectName: "dapp",
            }),
        ).rejects.toThrow(/Input 99 not found in the node, use .*--input-file/);
    });
});
