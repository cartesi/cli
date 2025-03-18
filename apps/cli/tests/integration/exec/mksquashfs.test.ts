import { satisfies } from "semver";
import { describe, expect, it } from "vitest";
import { mksquashfs } from "../../../src/exec/index.js";
import { TEST_SDK } from "../config.js";

describe("mksquashfs", () => {
    it("should report version", async () => {
        const version = await mksquashfs.version({
            forceDocker: true,
            image: TEST_SDK,
        });
        expect(version).toBeDefined();
        expect(
            satisfies(version!.format(), mksquashfs.requiredVersion),
        ).toBeTruthy();
    });
});
