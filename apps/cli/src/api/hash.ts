import type { Hash } from "viem";
import { getMachineHash } from "../base.js";

export type HashOptions = {
    /**
     * SDK image that built the machine snapshot, used when there is no local
     * `cartesi-machine-stored-hash`, as an emulator of another version may not
     * load the snapshot.
     * @default the sdk of `cartesi.toml`
     */
    sdk?: string;
};

/**
 * Read the template hash of the Cartesi machine snapshot created by
 * {@link build}, at `.cartesi/image` of the current working directory.
 * @param options hash options
 * @returns the machine template hash, or `undefined` if there is no snapshot
 */
export const hash = async (
    options: HashOptions = {},
): Promise<Hash | undefined> => getMachineHash({ sdk: options.sdk });
