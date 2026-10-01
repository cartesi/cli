import { describe, expect, it } from "bun:test";
import { toHex } from "viem";
import {
    buildDeployApplicationArgs,
    NODE_TEMPLATE_PATH,
    nodeExecArgs,
    parseApplications,
    parseProveSummary,
    parseReplaySummary,
    proveAccountsDriveArgs,
    replayArgs,
    transactionArgs,
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

describe("transactionArgs", () => {
    it("should forward nothing by default", () => {
        expect(transactionArgs({})).toEqual([]);
    });

    it("should forward each option that is set", () => {
        expect(
            transactionArgs({
                json: true,
                wait: false,
                waitTimeout: "5m",
                yes: true,
            }),
        ).toEqual(["--yes", "--json", "--no-wait", "--wait-timeout", "5m"]);
    });

    it("should not forward --no-wait when waiting", () => {
        expect(transactionArgs({ wait: true })).toEqual([]);
    });
});

describe("nodeExecArgs", () => {
    it("should run the command in the working directory", () => {
        expect(
            nodeExecArgs({
                command: ["true"],
                interactive: true,
                projectName: "dapp",
                workdir: "/tmp/work",
            }),
        ).toEqual([
            "compose",
            "--project-name",
            "dapp",
            "exec",
            "--workdir",
            "/tmp/work",
            "rollups_node",
            "true",
        ]);
    });

    it("should exec the command in the rollups node service", () => {
        expect(
            nodeExecArgs({
                command: ["cartesi-rollups-cli", "app", "list"],
                interactive: true,
                projectName: "dapp",
            }),
        ).toEqual([
            "compose",
            "--project-name",
            "dapp",
            "exec",
            "rollups_node",
            "cartesi-rollups-cli",
            "app",
            "list",
        ]);
    });

    it("should disable the TTY when not interactive", () => {
        expect(
            nodeExecArgs({
                command: ["true"],
                interactive: false,
                projectName: "dapp",
            }),
        ).toEqual([
            "compose",
            "--project-name",
            "dapp",
            "exec",
            "-T",
            "rollups_node",
            "true",
        ]);
    });

    it("should select the signer account index", () => {
        expect(
            nodeExecArgs({
                accountIndex: 1,
                command: ["true"],
                interactive: true,
                projectName: "dapp",
            }),
        ).toEqual([
            "compose",
            "--project-name",
            "dapp",
            "exec",
            "-e",
            "CARTESI_AUTH_MNEMONIC_ACCOUNT_INDEX=1",
            "rollups_node",
            "true",
        ]);
    });
});

const application = "0x1234567890abcdef1234567890abcdef12345678";
const account = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const hash = (n: number) => toHex(n, { size: 32 });

describe("replayArgs", () => {
    it("should replay the published template up to the epoch", () => {
        expect(
            replayArgs({ application, epochIndex: 108n, store: "/tmp/s" }),
        ).toEqual([
            "cartesi-rollups-machine-tool",
            "replay",
            "--template",
            NODE_TEMPLATE_PATH,
            "--application",
            application,
            "--to-epoch",
            "108",
            "--store",
            "/tmp/s",
        ]);
    });
});

describe("proveAccountsDriveArgs", () => {
    it("should pass the accounts drive layout in hex", () => {
        expect(
            proveAccountsDriveArgs({
                account,
                driveConfig: {
                    accountsDriveStartIndex: 0x300n,
                    log2LeavesPerAccount: 0n,
                    log2MaxNumOfAccounts: 17n,
                },
                outDir: "/tmp/out",
                snapshot: "/tmp/s",
            }),
        ).toEqual([
            "cartesi-rollups-machine-tool",
            "prove",
            "accounts-drive",
            "--snapshot",
            "/tmp/s",
            "--accounts-drive-start-index",
            "0x300",
            "--log2-max-num-of-accounts",
            "0x11",
            "--log2-leaves-per-account",
            "0x0",
            "--account",
            account,
            "--out-drive-root-proof",
            "/tmp/out/drive-root-proof.json",
            "--out-withdraw-proof",
            "/tmp/out/withdraw-proof.json",
        ]);
    });
});

describe("parseReplaySummary", () => {
    const summary = {
        processed_inputs: 3,
        last_input_index: "0x2",
        machine_root: hash(1),
        store: "/tmp/s",
    };

    it("should parse the summary", () => {
        expect(parseReplaySummary(JSON.stringify(summary))).toEqual({
            machineRoot: hash(1),
            processedInputs: 3,
            store: "/tmp/s",
        });
    });

    it("should read the summary from the last line", () => {
        expect(
            parseReplaySummary(`log line\n${JSON.stringify(summary)}\n`)
                .machineRoot,
        ).toBe(hash(1));
    });

    it("should reject a missing machine root", () => {
        expect(() =>
            parseReplaySummary(
                JSON.stringify({ ...summary, machine_root: undefined }),
            ),
        ).toThrow("machine_root");
    });

    it("should reject a machine root that is not a hash", () => {
        expect(() =>
            parseReplaySummary(
                JSON.stringify({ ...summary, machine_root: "0x1234" }),
            ),
        ).toThrow("machine_root");
    });

    it("should reject malformed output", () => {
        expect(() => parseReplaySummary("not json")).toThrow();
    });
});

describe("parseProveSummary", () => {
    const summary = {
        account,
        account_index: "0x2a",
        accounts_drive_merkle_root: hash(2),
        machine_root: hash(1),
        drive_root_proof_file: "/tmp/out/drive-root-proof.json",
        withdraw_proof_file: "/tmp/out/withdraw-proof.json",
    };

    it("should parse the summary", () => {
        expect(parseProveSummary(JSON.stringify(summary))).toEqual({
            accountIndex: 42n,
            accountsDriveMerkleRoot: hash(2),
            driveRootProofFile: "/tmp/out/drive-root-proof.json",
            machineRoot: hash(1),
            withdrawProofFile: "/tmp/out/withdraw-proof.json",
        });
    });

    it("should reject a missing withdraw proof file", () => {
        expect(() =>
            parseProveSummary(
                JSON.stringify({ ...summary, withdraw_proof_file: undefined }),
            ),
        ).toThrow("withdraw_proof_file");
    });
});
