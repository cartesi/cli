import { satisfies } from "semver";
import { describe, expect, it } from "vitest";
import { DEFAULT_SDK } from "../../src/config.js";
import { cartesiMachine } from "../../src/exec/index.js";

describe("cartesi-machine", () => {
    it("should report version", async () => {
        const version = await cartesiMachine.version({
            forceDocker: true,
            image: DEFAULT_SDK,
        });
        expect(version).toBeDefined();
        expect(
            satisfies(version!.format(), cartesiMachine.requiredVersion),
        ).toBeTruthy();
    });
});
