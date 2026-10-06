import { describe, expect, it } from "bun:test";
import { parseAccountIndex, resolveNodeApplication } from "../../src/node";

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

describe("resolveNodeApplication", () => {
    const deployed = "0x1234567890abcdef1234567890abcdef12345678";
    const lookup = (state: string | undefined, address?: string) => ({
        getApplicationAddress: async () => address as never,
        getServiceState: async () => state,
    });

    it("should tell to start the environment when the node isn't running", async () => {
        await expect(
            resolveNodeApplication({
                lookup: lookup("exited", deployed),
                projectName: "dapp",
            }),
        ).rejects.toThrow(/is not running, use .*cartesi run/);
    });

    it("should use the given application address", async () => {
        expect(
            await resolveNodeApplication({
                application: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
                lookup: lookup("running", deployed),
                projectName: "dapp",
            }),
        ).toBe("0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD");
    });

    it("should reject an invalid application address", async () => {
        await expect(
            resolveNodeApplication({
                application: "0x123",
                lookup: lookup("running", deployed),
                projectName: "dapp",
            }),
        ).rejects.toThrow("Invalid application address 0x123");
    });

    it("should use the application deployed for the current machine", async () => {
        expect(
            await resolveNodeApplication({
                lookup: lookup("running", deployed),
                projectName: "dapp",
            }),
        ).toBe(deployed);
    });

    it("should tell to pass --application when none is deployed", async () => {
        await expect(
            resolveNodeApplication({
                lookup: lookup("running"),
                projectName: "dapp",
            }),
        ).rejects.toThrow(/No application deployed .*--application/);
    });
});
