import { satisfies } from "semver";
import { describe, expect, it } from "vitest";
import { DEFAULT_SDK } from "../../src/config.js";
import { mksquashfs } from "../../src/exec/index.js";

describe("mksquashfs", () => {
    it("should report version", async () => {
        const version = await mksquashfs.version({
            forceDocker: true,
            image: DEFAULT_SDK,
        });
        expect(version).toBeDefined();
        expect(
            satisfies(version!.format(), mksquashfs.requiredVersion),
        ).toBeTruthy();
    });
});
