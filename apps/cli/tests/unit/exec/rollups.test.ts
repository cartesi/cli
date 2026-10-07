import { describe, expect, it } from "bun:test";
import {
    buildDeployApplicationArgs,
    parseApplications,
    parseLastAcceptedEpoch,
    parseNodeInput,
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

    it("should decode the withdrawal config the node registered", () => {
        const [deployment] = parseApplications(
            stdout([
                appListEntry({
                    withdrawal_config: {
                        guardian: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
                        log2_leaves_per_account: "0x0",
                        log2_max_num_of_accounts: "0x11",
                        accounts_drive_start_index: "0x240",
                        withdrawal_output_builder:
                            "0xb4d253c7a110241561b3ed6d632846df7d4e9af7",
                    },
                }),
            ]),
        );

        expect(deployment.withdrawalConfig).toEqual({
            accountsDriveStartIndex: 0x240n,
            guardian: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
            log2LeavesPerAccount: 0n,
            log2MaxNumOfAccounts: 17n,
            withdrawalOutputBuilder:
                "0xB4D253c7a110241561B3eD6d632846dF7d4e9Af7",
        });
    });

    it("should leave the withdrawal config undefined when the node omits it", () => {
        const [deployment] = parseApplications(stdout([appListEntry()]));

        expect(deployment.withdrawalConfig).toBeUndefined();
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

describe("parseNodeInput", () => {
    it("should return the input bytes of `read inputs`", () => {
        const stdout = JSON.stringify({
            data: { index: "0x4", raw_data: "0x415bf363cafe", status: "NONE" },
        });

        expect(parseNodeInput(stdout)).toBe("0x415bf363cafe");
    });
});

describe("parseLastAcceptedEpoch", () => {
    const machineHash =
        "0xc3595fc3b48b90fcf15cf935bcb92c24ae0d984e35221643776e079319eda1ba";
    const stdout = (data: unknown[]) =>
        JSON.stringify({
            data,
            pagination: { limit: 1, offset: 0, total_count: data.length },
        });

    it("should return the index and machine hash of the listed epoch", () => {
        expect(
            parseLastAcceptedEpoch(
                stdout([
                    {
                        index: "0x1",
                        machine_hash: machineHash,
                        status: "CLAIM_ACCEPTED",
                    },
                ]),
            ),
        ).toEqual({ index: 1n, machineHash });
    });

    it("should return undefined when no epoch was accepted", () => {
        expect(parseLastAcceptedEpoch(stdout([]))).toBeUndefined();
    });

    it("should leave the machine hash undefined when the node has none", () => {
        expect(
            parseLastAcceptedEpoch(
                stdout([{ index: "0x0", machine_hash: null }]),
            ),
        ).toEqual({ index: 0n, machineHash: undefined });
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
