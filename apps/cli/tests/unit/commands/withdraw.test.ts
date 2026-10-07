import { describe, expect, it } from "bun:test";
import { type Hash, toHex, zeroHash } from "viem";
import {
    generateAccountProofs,
    proofStorePath,
    replayLastFinalizedEpoch,
    replayStorePath,
    type WithdrawIo,
} from "../../../src/commands/withdraw";
import { account, application } from "../fixtures";

const root = toHex(1, { size: 32 });
const otherRoot = toHex(2, { size: 32 });
const fastRetry = { retries: 2, minTimeout: 1, maxTimeout: 1 };

/**
 * I/O that records its calls, with the given cache state and results. The
 * node reports the given (epoch index, machine hash) as last accepted in turn.
 */
const recordingIo = (options: {
    cached?: boolean;
    epochs?: [bigint, Hash][];
    proofRoot?: Hash;
    replayRoot?: Hash;
}) => {
    const calls: string[] = [];
    const epochs = options.epochs ?? [];
    let epochCall = 0;
    const io: WithdrawIo = {
        execNodeCommand: async ({ command }) => {
            calls.push(command.join(" "));
            return "";
        },
        getLastAcceptedEpoch: async () => {
            const epoch = epochs[Math.min(epochCall++, epochs.length - 1)];
            return epoch && { index: epoch[0], machineHash: epoch[1] };
        },
        nodePathExists: async ({ path }) => {
            calls.push(`exists ${path}`);
            return options.cached ?? false;
        },
        proveAccountsDrive: async () => {
            calls.push("prove");
            return {
                accountIndex: 0n,
                accountsDriveMerkleRoot: root,
                driveRootProofFile: "/tmp/drive-root-proof.json",
                machineRoot: options.proofRoot ?? root,
                withdrawProofFile: "/tmp/withdraw-proof.json",
            };
        },
        removeNodePath: async ({ path }) => {
            calls.push(`rm ${path}`);
            return "";
        },
        replayMachine: async ({ epochIndex }) => {
            calls.push(`replay ${epochIndex}`);
            return {
                machineRoot: options.replayRoot ?? root,
                processedInputs: 2,
                store: "",
            };
        },
    };
    return { calls, io };
};

describe("store paths", () => {
    it("should key the proofs by application and account", () => {
        expect(proofStorePath(application, account)).toBe(
            `/tmp/cartesi-withdraw/${application}/${account}`,
        );
    });
});

describe("replayStorePath", () => {
    it("should key the snapshot by application and epoch", () => {
        expect(replayStorePath(application, 7n)).toBe(
            `/tmp/cartesi-withdraw/${application}/epoch-7`,
        );
    });
});

describe("replayLastFinalizedEpoch", () => {
    const store = replayStorePath(application, 1n);

    it("should stop when nothing was finalized on chain", async () => {
        const { calls, io } = recordingIo({});
        await expect(
            replayLastFinalizedEpoch({
                application,
                finalizedMachineRoot: zeroHash,
                io,
                projectName: "dapp",
            }),
        ).rejects.toThrow("there are no funds to withdraw");
        expect(calls).toEqual([]);
    });

    it("should reuse a cached snapshot", async () => {
        const { calls, io } = recordingIo({
            cached: true,
            epochs: [[1n, root]],
        });
        expect(
            await replayLastFinalizedEpoch({
                application,
                finalizedMachineRoot: root,
                io,
                projectName: "dapp",
            }),
        ).toEqual({ store });
        expect(calls).toEqual([`exists ${store}`]);
    });

    it("should replay into a temporary path and move it into the cache", async () => {
        const { calls, io } = recordingIo({ epochs: [[1n, root]] });
        expect(
            await replayLastFinalizedEpoch({
                application,
                finalizedMachineRoot: root,
                io,
                projectName: "dapp",
            }),
        ).toEqual({ store });
        expect(calls).toEqual([
            `exists ${store}`,
            `rm ${store}.tmp`,
            "replay 1",
            `mv ${store}.tmp ${store}`,
        ]);
    });

    it("should not cache a replay whose root isn't the finalized one", async () => {
        const { calls, io } = recordingIo({
            epochs: [[1n, root]],
            replayRoot: otherRoot,
        });
        await expect(
            replayLastFinalizedEpoch({
                application,
                finalizedMachineRoot: root,
                io,
                projectName: "dapp",
            }),
        ).rejects.toThrow("does not match");
        expect(calls).toEqual([
            `exists ${store}`,
            `rm ${store}.tmp`,
            "replay 1",
            `rm ${store}.tmp`,
        ]);
    });

    it("should wait for the node to reach the finalized epoch", async () => {
        const { calls, io } = recordingIo({
            epochs: [
                [0n, otherRoot],
                [1n, root],
            ],
        });
        expect(
            await replayLastFinalizedEpoch({
                application,
                finalizedMachineRoot: root,
                io,
                projectName: "dapp",
                retry: fastRetry,
            }),
        ).toEqual({ store });
        expect(calls).toContain("replay 1");
    });

    it("should stop when the node never reaches the finalized epoch", async () => {
        const { calls, io } = recordingIo({ epochs: [[0n, otherRoot]] });
        await expect(
            replayLastFinalizedEpoch({
                application,
                finalizedMachineRoot: root,
                io,
                projectName: "dapp",
                retry: fastRetry,
            }),
        ).rejects.toThrow("hasn't processed the last finalized epoch yet");
        expect(calls).toEqual([]);
    });
});

describe("generateAccountProofs", () => {
    const store = replayStorePath(application, 1n);
    const driveConfig = {
        accountsDriveStartIndex: 0x240n,
        log2LeavesPerAccount: 0n,
        log2MaxNumOfAccounts: 17n,
    };

    it("should return the proofs of the finalized machine", async () => {
        const { calls, io } = recordingIo({});
        const proof = await generateAccountProofs({
            account,
            application,
            driveConfig,
            io,
            finalizedMachineRoot: root,
            projectName: "dapp",
            store,
        });
        expect(proof.withdrawProofFile).toBe("/tmp/withdraw-proof.json");
        expect(calls).toEqual(["prove"]);
    });

    it("should discard the cached snapshot when its proof doesn't match", async () => {
        const { calls, io } = recordingIo({ proofRoot: otherRoot });
        await expect(
            generateAccountProofs({
                account,
                application,
                driveConfig,
                io,
                finalizedMachineRoot: root,
                projectName: "dapp",
                store,
            }),
        ).rejects.toThrow("Removed the cached snapshot");
        expect(calls).toEqual(["prove", `rm ${store}`]);
    });
});
