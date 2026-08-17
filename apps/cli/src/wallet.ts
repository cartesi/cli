import input from "@inquirer/input";
import {
    createTestClient,
    defineChain,
    http,
    publicActions,
    walletActions,
} from "viem";
import { anvil } from "viem/chains";
import { getProjectName } from "./base.js";
import { PREFERRED_PORT } from "./config/index.js";
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

export const connect = async (options: {
    rpcUrl?: string;
    projectName?: string;

    /**
     * Ask for the RPC URL when it can't be resolved from the running project.
     * @default true
     */
    interactive?: boolean;
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

/** Client connected to the devnet of a local environment. */
export type DevnetClient = Awaited<ReturnType<typeof connect>>;
