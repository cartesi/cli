import { satisfies } from "semver";
import { describe, expect, it } from "vitest";
import { genext2fs } from "../../src/exec/index.js";

describe("genext2fs", () => {
    it("should report version", async () => {
        const version = await genext2fs.version({
            forceDocker: true,
            image: "cartesi/sdk:0.11.0",
        });

        expect(version).toBeDefined();
        expect(
            satisfies(version!.format(), genext2fs.requiredVersion),
        ).toBeTruthy();
    });
});
