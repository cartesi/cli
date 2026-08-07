import type { Hash } from "viem";
import { getMachineHash } from "../base.js";

/**
 * Read the template hash of the Cartesi machine snapshot created by
 * {@link build}, at `.cartesi/image` of the current working directory.
 * @returns the machine template hash, or `undefined` if there is no snapshot
 */
export const hash = async (): Promise<Hash | undefined> => getMachineHash();
