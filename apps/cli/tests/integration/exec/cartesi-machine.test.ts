import { beforeAll, describe, expect, it } from "bun:test";
import { type SemVer, satisfies } from "semver";
import { cartesiMachine } from "../../../src/exec/index.js";
import { setupIntegrationTests, TEST_SDK } from "../config.js";

beforeAll(async () => {
    await setupIntegrationTests();
}, { timeout: 60000 });

describe("cartesi-machine", () => {
    it("should report version", async () => {
        const version = await cartesiMachine.version({
            forceDocker: true,
            image: TEST_SDK,
        });
        expect(version).toBeDefined();
        expect(
            satisfies(
                (version as SemVer).format(),
                cartesiMachine.requiredVersion,
            ),
        ).toBeTruthy();
    });
});
