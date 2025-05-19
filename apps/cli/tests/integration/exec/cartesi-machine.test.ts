import { type SemVer, satisfies } from "semver";
import { describe, expect, it } from "vitest";
import { cartesiMachine } from "../../../src/exec/index.js";
import { TEST_SDK } from "../config.js";

describe("cartesi-machine", () => {
    it("should report version", async () => {
        const version = await cartesiMachine.version({
            forceDocker: true,
            image: TEST_SDK,
        });
        expect(version).toBeDefined();
        expect(
            satisfies(
                (version as SemVer).format(),
                cartesiMachine.requiredVersion,
            ),
        ).toBeTruthy();
    });
});
