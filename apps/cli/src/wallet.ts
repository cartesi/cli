import input from "@inquirer/input";
import {
    type Address,
    createTestClient,
    defineChain,
    type Hex,
    http,
    isAddressEqual,
    publicActions,
    toHex,
    walletActions,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { getProjectName } from "./base.js";
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

/**
 * How many accounts the CLI derives from the devnet mnemonic: the 10 anvil
 * funds and unlocks, and the ones after them, up to the sentry pool's last.
 */
export const DEVNET_ACCOUNTS = 30;

/**
 * Returns a devnet account by its index in the mnemonic, with the key the
 * CLI signs with on its behalf. The mnemonic is public, so the key is too.
 */
export const getDevnetAccount = (
    index: number,
): { address: Address; privateKey: Hex } => {
    if (!Number.isInteger(index) || index < 0 || index >= DEVNET_ACCOUNTS) {
        throw new Error(
            `There is no devnet account ${index}, the CLI derives accounts 0 to ${DEVNET_ACCOUNTS - 1}`,
        );
    }
    const account = mnemonicToAccount(DEVNET_MNEMONIC, {
        addressIndex: index,
    });
    const privateKey = account.getHdKey().privateKey;
    if (!privateKey) {
        throw new Error(`Devnet account ${index} has no private key`);
    }
    return { address: account.address, privateKey: toHex(privateKey) };
};

/**
 * Index of the devnet account that sends inputs and deposits when no `--from`
 * is given. The node signs its claims with account 0 and the CLI uses account
 * 1 as the guardian, so a sender of its own shares no nonces with either.
 */
export const DEFAULT_SENDER_INDEX = 8;

/**
 * Returns the default sender among the accounts the RPC exposes.
 * @throws if the RPC exposes too few accounts
 */
export const getDefaultSender = async (client: {
    getAddresses: () => Promise<readonly Address[]>;
}): Promise<Address> => {
    const addresses = await client.getAddresses();
    const sender = addresses[DEFAULT_SENDER_INDEX];
    if (sender === undefined) {
        throw new Error(
            `The RPC exposes ${addresses.length} accounts, so there is no devnet account ${DEFAULT_SENDER_INDEX} to send from; pass --from to choose the sender`,
        );
    }
    return sender;
};
