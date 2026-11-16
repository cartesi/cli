import { type Address, isAddressEqual, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
    type HostSigner,
    hostSignerEnv,
    type NodeSigner,
} from "./exec/node-container.js";
import { findMnemonicAccountIndex } from "./wallet.js";

/**
 * Work out how to sign as the guardian, the only account allowed to
 * foreclose. A signer given for the command takes precedence over the node's.
 * cartesi-rollups-cli signs with whatever its environment configures, so for
 * a mnemonic the guardian's account index is looked up, unless one is given.
 * A private key has no index to choose.
 * @returns the account index and environment to sign with, and a warning to show, if any
 */
export const resolveForecloseSigner = (options: {
    accountIndex?: number;
    guardian: Address;
    host?: HostSigner;
    node?: NodeSigner;
}): {
    accountIndex?: number;
    env?: Record<string, string>;
    warning?: string;
} => {
    const { accountIndex, guardian, host, node } = options;

    if (isAddressEqual(guardian, zeroAddress)) {
        throw new Error(
            "The application was deployed without a withdrawal config and cannot be foreclosed",
        );
    }

    // the signer given for the command is passed down to cartesi-rollups-cli
    const env = host ? hostSignerEnv(host) : undefined;
    const ignoredIndex =
        accountIndex === undefined
            ? {}
            : {
                  warning:
                      "--account-index is ignored when signing with a private key",
              };

    if (host?.kind === "private_key") {
        const { address } = privateKeyToAccount(host.privateKey);
        if (!isAddressEqual(address, guardian)) {
            throw new Error(
                `The private key's address ${address} isn't the guardian ${guardian}`,
            );
        }
        return { ...ignoredIndex, env };
    }

    // the node's private key is never read, so it can't be checked here
    const signer = host ?? node;
    if (!signer) {
        throw new Error("No signer to foreclose with");
    }
    if (signer.kind === "private_key") {
        return ignoredIndex;
    }

    if (accountIndex !== undefined) {
        return { accountIndex, env };
    }

    const index = findMnemonicAccountIndex({
        address: guardian,
        mnemonic: signer.mnemonic,
    });
    if (index === undefined) {
        throw new Error(
            `Guardian ${guardian} isn't one of the first 20 accounts of the mnemonic in use. If it belongs to another mnemonic, set CARTESI_AUTH_MNEMONIC; if its index is higher, pass --account-index; if it's a raw private key, set CARTESI_AUTH_PRIVATE_KEY`,
        );
    }
    return { accountIndex: index, env };
};
