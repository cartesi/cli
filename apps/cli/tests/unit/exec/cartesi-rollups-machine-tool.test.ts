import { describe, expect, it } from "bun:test";
import { toHex } from "viem";
import {
    NODE_TEMPLATE_PATH,
    parseProveSummary,
    parseReplaySummary,
    proveAccountsDriveArgs,
    replayArgs,
} from "../../../src/exec/cartesi-rollups-machine-tool";

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
