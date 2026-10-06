import { describe, expect, it } from "bun:test";
import {
    buildDeployApplicationArgs,
    parseApplications,
} from "../../../src/exec/rollups";

/** A single entry as `cartesi-rollups-cli app list` prints it. */
const appListEntry = (overrides: Record<string, unknown> = {}) => ({
    name: "echo",
    iapplication_address: "0x1234567890abcdef1234567890abcdef12345678",
    iconsensus_address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    template_hash:
        "0x0000000000000000000000000000000000000000000000000000000000000001",
    epoch_length: "0x2d0",
    status: "OK",
    reason: null,
    enabled: true,
    ...overrides,
});

const stdout = (entries: unknown[]) => JSON.stringify(entries);

describe("parseApplications", () => {
    it("should map the node payload onto a deployment", () => {
        const [deployment] = parseApplications(stdout([appListEntry()]));

        expect(deployment).toEqual({
            name: "echo",
            address: "0x1234567890abcdef1234567890abcdef12345678",
            consensus: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
            templateHash:
                "0x0000000000000000000000000000000000000000000000000000000000000001",
            epochLength: 720,
            status: "OK",
            reason: undefined,
            enabled: true,
        });
    });

    it("should decode the hex encoded epoch length", () => {
        const [deployment] = parseApplications(
            stdout([appListEntry({ epoch_length: "0x1" })]),
        );

        expect(deployment.epochLength).toBe(1);
    });

    // The status is cast, never validated, so every value the type claims has
    // to survive parsing unchanged.
    it.each([
        "OK",
        "FAILED",
        "DIVERGED",
        "CORRUPTED",
        "GUEST_EXCEPTION",
        "MACHINE_HALTED",
        "MCYCLE_OVERFLOW",
        "UNEXPECTED_YIELD",
        "INVALID_OUTPUTS_ROOT",
    ])("should preserve the %s application status", (status) => {
        const [deployment] = parseApplications(
            stdout([appListEntry({ status })]),
        );

        expect(deployment.status).toBe(status);
    });

    it("should expose the reason reported alongside a terminal status", () => {
        const [deployment] = parseApplications(
            stdout([
                appListEntry({
                    status: "GUEST_EXCEPTION",
                    reason: "guest exception at input 3",
                }),
            ]),
        );

        expect(deployment.status).toBe("GUEST_EXCEPTION");
        expect(deployment.reason).toBe("guest exception at input 3");
    });

    it("should leave the reason undefined when the node reports null", () => {
        const [deployment] = parseApplications(
            stdout([appListEntry({ reason: null })]),
        );

        expect(deployment.reason).toBeUndefined();
    });

    it("should leave the reason undefined when the node omits it", () => {
        const { reason, ...withoutReason } = appListEntry();

        const [deployment] = parseApplications(stdout([withoutReason]));

        expect(deployment.reason).toBeUndefined();
    });

    it("should map every application the node returns", () => {
        const deployments = parseApplications(
            stdout([
                appListEntry({ name: "first" }),
                appListEntry({ name: "second", status: "MACHINE_HALTED" }),
            ]),
        );

        expect(deployments).toHaveLength(2);
        expect(deployments.map((d) => d.name)).toEqual(["first", "second"]);
        expect(deployments[1].status).toBe("MACHINE_HALTED");
    });

    it("should return no deployments when none are registered", () => {
        expect(parseApplications(stdout([]))).toEqual([]);
    });

    // getDeployments wraps this in a try/catch and turns a throw into [],
    // which is how an unreachable node surfaces to callers.
    it("should throw when the output is not valid json", () => {
        expect(() => parseApplications("not json")).toThrow();
    });
});

describe("buildDeployApplicationArgs", () => {
    const base = {
        claimStagingPeriod: 720,
        epochLength: 10,
        name: "echo",
        projectName: "cartesi",
        snapshotPath: ".cartesi/image",
    };

    it("should pass the claim staging period without prt", () => {
        const args = buildDeployApplicationArgs(base);

        expect(args).toContain("--claim-staging-period");
        expect(args[args.indexOf("--claim-staging-period") + 1]).toBe("720");
        expect(args).not.toContain("--prt");
    });

    // the node takes --claim-staging-period on the whole deploy command, so a
    // value passed alongside --prt must not be dropped
    it("should pass the claim staging period with prt", () => {
        const args = buildDeployApplicationArgs({ ...base, prt: true });

        expect(args).toContain("--prt");
        expect(args).toContain("--claim-staging-period");
        expect(args[args.indexOf("--claim-staging-period") + 1]).toBe("720");
    });

    it("should use the epoch length when no consensus is given", () => {
        const args = buildDeployApplicationArgs(base);

        expect(args).toContain("--epoch-length");
        expect(args).not.toContain("--consensus");
    });

    it("should use the consensus instead of the epoch length when given", () => {
        const args = buildDeployApplicationArgs({
            ...base,
            consensus: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        });

        expect(args).toContain("--consensus");
        expect(args).not.toContain("--epoch-length");
    });

    it("should start with the name and snapshot path and end with --json", () => {
        const args = buildDeployApplicationArgs(base);

        expect(args.slice(0, 2)).toEqual(["echo", ".cartesi/image"]);
        expect(args.at(-1)).toBe("--json");
    });
});
