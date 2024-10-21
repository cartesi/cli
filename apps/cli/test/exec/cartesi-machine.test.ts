import { satisfies } from "semver";
import { describe, expect, it } from "vitest";
import { cartesiMachine } from "../../src/exec/index.js";

describe("cartesi-machine", () => {
    it("should report version", async () => {
        const version = await cartesiMachine.version({
            forceDocker: true,
            image: "cartesi/sdk:0.11.0",
        });
        expect(version).toBeDefined();
        expect(
            satisfies(version!.format(), cartesiMachine.requiredVersion),
        ).toBeTruthy();
    });
});
