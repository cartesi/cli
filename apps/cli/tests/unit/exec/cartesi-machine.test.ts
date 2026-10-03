import { describe, expect, it } from "bun:test";
import { parse, satisfies, type SemVer } from "semver";
import {
    requiredVersion,
    UnsupportedVersionError,
} from "../../../src/exec/cartesi-machine.js";

describe("requiredVersion", () => {
    it.each(["0.21.0", "0.21.3"])("should accept %s", (version) => {
        expect(satisfies(version, requiredVersion)).toBeTruthy();
    });

    it.each([
        "0.20.0",
        "0.20.9",
        "0.22.0",
        "1.0.0",
    ])("should reject %s", (version) => {
        expect(satisfies(version, requiredVersion)).toBeFalsy();
    });
});

describe("UnsupportedVersionError", () => {
    it("should name the version found and the range required", () => {
        const error = new UnsupportedVersionError(parse("0.20.0") as SemVer);
        expect(error.message).toEqual(
            `cartesi-machine 0.20.0 found, but ${requiredVersion.raw} is required`,
        );
    });
});
