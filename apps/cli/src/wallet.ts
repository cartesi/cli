import input from "@inquirer/input";
import {
    type Address,
    createTestClient,
    defineChain,
    http,
    type HttpTransport,
    isAddressEqual,
    type PublicActions,
    publicActions,
    type TestClient,
    type WalletActions,
    walletActions,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { getProjectName } from "./base.js";
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
    interactive?: boolean;
}) => {
    // if rpcUrl is provided, use it
    if (options.rpcUrl) return options.rpcUrl;

    // otherwise, try to resolve host:port of the docker project
    try {
        const projectName = getProjectName(options);
        const host = await getProjectPort({ projectName });
        return `http://${host}/anvil`;
    } catch (error: unknown) {
        if (options.interactive === false) {
            // no terminal to ask the user for the RPC URL
            throw new Error(
                `Unable to resolve the RPC URL of project '${getProjectName(options)}', make sure it is running, or define 'rpcUrl'`,
                { cause: error },
            );
        }
        return await input({
            message: "RPC URL",
            default: `http://127.0.0.1:${PREFERRED_PORT}/anvil`,
        });
    }
};

/**
 * Client connected to the devnet of a local environment.
 *
 * The type is spelled out, instead of inferred from {@link connect}, because the
 * inferred one inlines viem internals that cannot be named from outside their
 * package, which breaks declaration emit.
 */
export type DevnetClient = TestClient<"anvil", HttpTransport, typeof cartesi> &
    PublicActions<HttpTransport, typeof cartesi> &
    WalletActions<typeof cartesi>;

export const connect = async (options: {
    rpcUrl?: string;
    projectName?: string;

    /**
     * Ask for the RPC URL when it can't be resolved from the running project.
     * @default true
     */
    interactive?: boolean;
}): Promise<DevnetClient> => {
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
