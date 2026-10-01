import input from "@inquirer/input";
import {
    type Address,
    createTestClient,
    defineChain,
    http,
    isAddressEqual,
    publicActions,
    walletActions,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { getCartesiEnvironmentVariables, getProjectName } from "./base.js";
import { DEVNET_MNEMONIC } from "./compose/node.js";
import { PREFERRED_PORT } from "./config.js";
import { getProjectPort } from "./exec/rollups.js";

export const cartesi = defineChain({
    ...anvil,
    name: "Cartesi Devnet",
    testnet: true,
});

const getRpcUrl = async (options: {
    rpcUrl?: string;
    projectName?: string;
}) => {
    // if rpcUrl is provided, use it
    if (options.rpcUrl) return options.rpcUrl;

    // otherwise, try to resolve host:port of the docker project
    try {
        const projectName = getProjectName(options);
        const host = await getProjectPort({ projectName });
        return `http://${host}/anvil`;
    } catch {
        return await input({
            message: "RPC URL",
            default: `http://127.0.0.1:${PREFERRED_PORT}/anvil`,
        });
    }
};

export const connect = async (options: {
    rpcUrl?: string;
    projectName?: string;
}) => {
    // resolve rpc url
    const rpcUrl = await getRpcUrl(options);

    // create test client
    const client = createTestClient({
        chain: cartesi,
        mode: "anvil",
        transport: http(rpcUrl),
        pollingInterval: 200, // default is 4000ms (12s / 3)
    })
        .extend(publicActions)
        .extend(walletActions);
    return client;
};

/**
 * Mnemonic the rollups node signs with: the one passed down from the host
 * environment, or the devnet one
 */
export const getNodeMnemonic = (): string =>
    getCartesiEnvironmentVariables().CARTESI_AUTH_MNEMONIC ?? DEVNET_MNEMONIC;

/**
 * Find the index of the account derived from a mnemonic that has the given
 * address
 * @returns the account index, or undefined if none of the first `max` accounts matches
 */
export const findMnemonicAccountIndex = (options: {
    address: Address;
    max?: number;
    mnemonic: string;
}): number | undefined => {
    const { address, max = 20, mnemonic } = options;
    for (let addressIndex = 0; addressIndex < max; addressIndex++) {
        const account = mnemonicToAccount(mnemonic, { addressIndex });
        if (isAddressEqual(account.address, address)) {
            return addressIndex;
        }
    }
    return undefined;
};
