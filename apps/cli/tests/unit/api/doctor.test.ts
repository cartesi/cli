import { describe, expect, it } from "bun:test";
import {
    type DoctorCheck,
    skipUnmetRequirements,
} from "../../../src/api/doctor.js";

const checks = [
    { name: "Docker Engine" },
    { name: "Docker Compose", requires: ["Docker Engine"] },
    { name: "Docker Buildx", requires: ["Docker Engine"] },
    {
        name: "Docker RISC-V support",
        requires: ["Docker Engine", "Docker Buildx"],
    },
    { name: "Cartesi Machine" },
];

const ok = (name: string): DoctorCheck => ({ name, status: "ok" });
const failed = (name: string): DoctorCheck => ({
    name,
    status: "failed",
    message: `${name} failed`,
});

describe("api/doctor", () => {
    describe("skipUnmetRequirements", () => {
        it("should keep the results when every requirement is met", () => {
            const results = checks.map(({ name }) => ok(name));
            expect(skipUnmetRequirements(checks, results)).toEqual(results);
        });

        it("should skip every check that requires a missing docker", () => {
            const results = [
                failed("Docker Engine"),
                failed("Docker Compose"),
                failed("Docker Buildx"),
                failed("Docker RISC-V support"),
                ok("Cartesi Machine"),
            ];
            expect(skipUnmetRequirements(checks, results)).toEqual([
                failed("Docker Engine"),
                {
                    name: "Docker Compose",
                    status: "skipped",
                    message: "requires Docker Engine",
                },
                {
                    name: "Docker Buildx",
                    status: "skipped",
                    message: "requires Docker Engine",
                },
                {
                    name: "Docker RISC-V support",
                    status: "skipped",
                    message: "requires Docker Engine",
                },
                ok("Cartesi Machine"),
            ]);
        });

        it("should skip the RISC-V check when buildx is missing", () => {
            const results = [
                ok("Docker Engine"),
                ok("Docker Compose"),
                failed("Docker Buildx"),
                failed("Docker RISC-V support"),
                ok("Cartesi Machine"),
            ];
            expect(skipUnmetRequirements(checks, results)).toEqual([
                ok("Docker Engine"),
                ok("Docker Compose"),
                failed("Docker Buildx"),
                {
                    name: "Docker RISC-V support",
                    status: "skipped",
                    message: "requires Docker Buildx",
                },
                ok("Cartesi Machine"),
            ]);
        });

        it("should keep a failure whose requirements are met", () => {
            const results = [
                ok("Docker Engine"),
                ok("Docker Compose"),
                ok("Docker Buildx"),
                failed("Docker RISC-V support"),
                failed("Cartesi Machine"),
            ];
            expect(skipUnmetRequirements(checks, results)).toEqual(results);
        });
    });
});
