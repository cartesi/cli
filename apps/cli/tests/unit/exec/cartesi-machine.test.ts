import { describe, expect, it } from "bun:test";
import { type SemVer, satisfies } from "semver";
import { cartesiMachine } from "../../../src/exec/index.js";

describe("cartesi-machine", () => {
    it("should report the version of the bundled emulator", () => {
        const version = cartesiMachine.version();

        expect(version).toBeDefined();
        expect(
            satisfies(
                (version as SemVer).format(),
                cartesiMachine.requiredVersion,
            ),
        ).toBeTruthy();
    });

    it("should report the emulator default configuration", () => {
        const config = cartesiMachine.defaultConfig();

        // the bootargs the CLI appends to, mounting the root drive from pmem0
        expect(config.dtb?.bootargs).toContain("root=/dev/pmem0");
    });
});
