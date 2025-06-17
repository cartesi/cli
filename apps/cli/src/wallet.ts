import {
    createTestClient,
    defineChain,
    http,
    publicActions,
    walletActions,
} from "viem";
import { cannon } from "viem/chains";
import { getProjectName } from "./base.js";
import { getProjectPort } from "./exec/rollups.js";

export const cartesi = defineChain({
    ...cannon,
    name: "Cartesi Devnet",
    testnet: true,
});

const getRpcUrl = async (options: {
    rpcUrl?: string;
    projectName?: string;
}) => {
    // if rpcUrl is provided, use it
    if (options.rpcUrl) return options.rpcUrl;

    // otherwise, resolve host:port of the docker project
    const projectName = getProjectName(options);
    const host = await getProjectPort({ projectName });
    return `http://${host}/anvil`;
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
    })
        .extend(publicActions)
        .extend(walletActions);
    return client;
};
