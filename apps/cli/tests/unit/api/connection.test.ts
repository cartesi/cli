import { describe, expect, it } from "bun:test";
import { resolveConnection } from "../../../src/api/connection.js";
import type { DevnetClient } from "../../../src/wallet.js";

// never called, as every address is given
const client = {} as DevnetClient;

const application = "0x1111111111111111111111111111111111111111";
const sender = "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f";

describe("api/connection", () => {
    describe("resolveConnection", () => {
        it("should checksum the sender, as addresses read from the chain are", async () => {
            const connection = await resolveConnection({
                application,
                client,
                from: sender.toLowerCase() as `0x${string}`,
                projectName: "test",
            });
            expect(connection.from).toBe(sender);
        });

        it("should checksum the application", async () => {
            const connection = await resolveConnection({
                application: application.toLowerCase() as `0x${string}`,
                client,
                from: sender,
                projectName: "test",
            });
            expect(connection.application).toBe(application);
        });

        it("should reject a malformed sender", async () => {
            expect(
                resolveConnection({
                    application,
                    client,
                    from: "0x1234",
                    projectName: "test",
                }),
            ).rejects.toThrow("is invalid");
        });
    });
});
