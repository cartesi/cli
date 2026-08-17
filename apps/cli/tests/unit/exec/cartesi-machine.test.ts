import { describe, expect, it } from "bun:test";
import { parse, satisfies, type SemVer } from "semver";
import {
    assertSupported,
    defaultConfig,
    requiredVersion,
    UnsupportedVersionError,
    version,
} from "../../../src/exec/cartesi-machine.js";

const semver = (value: string) => parse(value) as SemVer;

describe("requiredVersion", () => {
    it.each(["0.21.0", "0.21.3"])("should accept %s", (value) => {
        expect(satisfies(value, requiredVersion)).toBeTruthy();
    });

    it.each(["0.20.0", "0.20.9", "0.22.0", "1.0.0"])(
        "should reject %s",
        (value) => {
            expect(satisfies(value, requiredVersion)).toBeFalsy();
        },
    );
});

describe("assertSupported", () => {
    it.each(["0.21.0", "0.21.3"])("should accept %s", (value) => {
        expect(() => assertSupported(semver(value))).not.toThrow();
    });

    it.each(["0.20.0", "0.22.0"])("should reject %s", (value) => {
        expect(() => assertSupported(semver(value))).toThrowError(
            new UnsupportedVersionError(semver(value)),
        );
    });

    it("should not block when the version could not be determined", () => {
        // null means the emulator reported something unparseable, which
        // creating the machine reports itself
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

describe("version", () => {
    it("should report a supported emulator", () => {
        // the bindings link against the emulator, so the version is fixed at
        // build time and has to be one the CLI supports
        const found = version();

        expect(found).not.toBeNull();
        expect(
            satisfies((found as SemVer).format(), requiredVersion),
        ).toBeTruthy();
    });
});

describe("defaultConfig", () => {
    it("should report the emulator default configuration", () => {
        // the bootargs the CLI appends to, mounting the root drive from pmem0
        expect(defaultConfig().dtb?.bootargs).toContain("root=/dev/pmem0");
    });
});
