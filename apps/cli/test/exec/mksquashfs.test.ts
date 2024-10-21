import { satisfies } from "semver";
import { describe, expect, it } from "vitest";
import { mksquashfs } from "../../src/exec/index.js";

describe("mksquashfs", () => {
    it("should report version", async () => {
        const version = await mksquashfs.version({
            forceDocker: true,
            image: "cartesi/sdk:0.11.0",
        });
        expect(version).toBeDefined();
        expect(
            satisfies(version!.format(), mksquashfs.requiredVersion),
        ).toBeTruthy();
    });
});
