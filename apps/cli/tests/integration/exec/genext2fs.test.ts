import { beforeAll, describe, expect, it } from "bun:test";
import { type SemVer, satisfies } from "semver";
import { genext2fs } from "../../../src/exec/index.js";
import { setupIntegrationTests, TEST_SDK } from "../config.js";

beforeAll(async () => {
    await setupIntegrationTests();
}, { timeout: 60000 });

describe("genext2fs", () => {
    it("should report version", async () => {
        const version = await genext2fs.version({
            forceDocker: true,
            image: TEST_SDK,
        });

        expect(version).toBeDefined();
        expect(
            satisfies((version as SemVer).format(), genext2fs.requiredVersion),
        ).toBeTruthy();
    });
});
