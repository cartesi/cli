import { describe, expect, it } from "bun:test";
import { parse, satisfies, type SemVer } from "semver";
import {
    assertSupported,
    requiredVersion,
    UnsupportedVersionError,
} from "../../../src/exec/cartesi-machine.js";

const semver = (version: string) => parse(version) as SemVer;

describe("requiredVersion", () => {
    it.each(["0.21.0", "0.21.3"])("should accept %s", (version) => {
        expect(satisfies(version, requiredVersion)).toBeTruthy();
    });

    it.each(["0.20.0", "0.20.9", "0.22.0", "1.0.0"])(
        "should reject %s",
        (version) => {
            expect(satisfies(version, requiredVersion)).toBeFalsy();
        },
    );
});

describe("assertSupported", () => {
    it.each(["0.21.0", "0.21.3"])("should accept %s", (version) => {
        expect(() => assertSupported(semver(version))).not.toThrow();
    });

    it.each(["0.20.0", "0.22.0"])("should reject %s", (version) => {
        expect(() => assertSupported(semver(version))).toThrowError(
            new UnsupportedVersionError(semver(version)),
        );
    });

    it("should not block when the version could not be determined", () => {
        // null also means the binary is missing or docker is down, which booting reports itself
        expect(() => assertSupported(null)).not.toThrow();
    });
});

describe("UnsupportedVersionError", () => {
    it("should name the version found and the range required", () => {
        const error = new UnsupportedVersionError(semver("0.20.0"));
        expect(error.message).toEqual(
            `cartesi-machine 0.20.0 found, but ${requiredVersion.raw} is required`,
        );
    });
});
