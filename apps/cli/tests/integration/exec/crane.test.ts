import { satisfies } from "semver";
import { describe, expect, it } from "vitest";
import { DEFAULT_SDK } from "../../../src/config.js";
import { crane } from "../../../src/exec/index.js";

describe("crane", () => {
    it("should report version", async () => {
        const version = await crane.version({
            forceDocker: true,
            image: DEFAULT_SDK,
        });
        expect(version).toBeDefined();
        expect(
            satisfies(version!.format(), crane.requiredVersion),
        ).toBeTruthy();
    });
});
