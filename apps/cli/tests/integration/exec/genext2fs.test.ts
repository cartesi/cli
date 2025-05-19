import { type SemVer, satisfies } from "semver";
import { describe, expect, it } from "vitest";
import { genext2fs } from "../../../src/exec/index.js";
import { TEST_SDK } from "../config.js";

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
