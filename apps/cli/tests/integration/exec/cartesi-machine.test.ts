import { beforeAll, describe, expect, it } from "bun:test";
import { cartesiMachine } from "../../../src/exec/index.js";
import { setupIntegrationTests, TEST_SDK } from "../config.js";

beforeAll(
    async () => {
        await setupIntegrationTests();
    },
    { timeout: 60000 },
);

describe("cartesi-machine", () => {
    it("should report version", async () => {
        const version = await cartesiMachine.version({
            forceDocker: true,
            image: TEST_SDK,
        });
        expect(version).not.toBeNull();
        // the check the CLI applies
        expect(() => cartesiMachine.assertSupported(version)).not.toThrow();
    });
});
