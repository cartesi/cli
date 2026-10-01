import {
    type Application,
    type CartesiPublicClient,
    createCartesiPublicClient,
} from "@cartesi/client";
import pRetry from "p-retry";
import { type Address, http } from "viem";
import { getProjectPort } from "./exec/rollups.js";

/**
 * Create a client for the JSON-RPC API of the local rollups node
 * @param options projectName
 * @returns client exposing the cartesi_* methods
 */
export const getNodeClient = async (options: {
    projectName: string;
}): Promise<CartesiPublicClient> => {
    const host = await getProjectPort(options);
    return createCartesiPublicClient({
        transport: http(`http://${host}/rpc`),
    });
};

/**
 * Wait until the node reports an application state that satisfies the
 * predicate. The node observes chain events with some lag, so a state change
 * caused by a transaction is not visible right after it is mined.
 * @returns the application in the expected state
 */
export const waitForApplication = async (options: {
    application: Address;
    client: CartesiPublicClient;
    message: string;
    predicate: (application: Application) => boolean;
    retries?: number;
}): Promise<Application> => {
    const { application, client, message, predicate, retries = 20 } = options;
    return pRetry(
        async () => {
            const app = await client.getApplication({ application });
            if (!predicate(app)) {
                throw new Error(message);
            }
            return app;
        },
        {
            retries,
            minTimeout: 500,
            maxTimeout: 2_000,
            factor: 1.2,
        },
    );
};
