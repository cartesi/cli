import { load } from "@cartesi/machine";
import type { Hash } from "viem";

/**
 * Reads the root hash of a stored Cartesi machine snapshot.
 * @param machineDir directory holding the machine snapshot
 * @returns the machine hash, or undefined if the snapshot can't be read
 */
export const computeHash = async (
    machineDir: string,
): Promise<Hash | undefined> => {
    try {
        const machine = load(machineDir);
        try {
            return `0x${machine.getRootHash().toString("hex")}`;
        } finally {
            machine.destroy();
        }
    } catch {
        return undefined;
    }
};
