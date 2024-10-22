import { satisfies } from "semver";
import { describe, expect, it } from "vitest";
import { DEFAULT_SDK } from "../../src/config.js";
import { genext2fs } from "../../src/exec/index.js";

describe("genext2fs", () => {
    it("should report version", async () => {
        const version = await genext2fs.version({
            forceDocker: true,
            image: DEFAULT_SDK,
        });

        expect(version).toBeDefined();
        expect(
            satisfies(version!.format(), genext2fs.requiredVersion),
        ).toBeTruthy();
    });
});
