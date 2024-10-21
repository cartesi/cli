import { satisfies } from "semver";
import { describe, expect, it } from "vitest";
import { crane } from "../../src/exec/index.js";

describe("crane", () => {
    it("should report version", async () => {
        const version = await crane.version({
            forceDocker: true,
            image: "cartesi/sdk:0.11.0",
        });
        expect(version).toBeDefined();
        expect(
            satisfies(version!.format(), crane.requiredVersion),
        ).toBeTruthy();
    });
});
