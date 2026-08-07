import type { Address } from "viem";
import { getProjectName } from "../base.js";
import { getApplicationAddress } from "../exec/rollups.js";
import { connect, type DevnetClient } from "../wallet.js";

export type ConnectionOptions = {
    /**
     * Address of the application to interact with.
     * @default the application deployed to the local node
     */
    application?: Address;

    /**
     * Address of the transaction sender, which is impersonated.
     * @default the first account of the devnet
     */
    from?: Address;

    /**
     * Name of the project (used by docker compose and cartesi-rollups-node).
     * @default basename of the current working directory
     */
    projectName?: string;

    /**
     * RPC URL of the Cartesi Devnet.
     * @default the anvil of the running project
     */
    rpcUrl?: string;

    /**
     * Client to send the transactions with.
     * @default a client connected to the devnet of the running project
     */
    client?: DevnetClient;
};

export type Connection = {
    /** Address of the application to interact with. */
    application: Address;

    /** Client connected to the devnet. */
    client: DevnetClient;

    /** Address of the transaction sender. */
    from: Address;

    /** Name of the project. */
    projectName: string;
};

/**
 * Resolve everything needed to send a transaction to a local environment: the
 * client, the sender and the application address, querying the running project
 * for whatever was not explicitly provided.
 * @param options connection options
 * @returns the resolved connection
 */
export const resolveConnection = async (
    options: ConnectionOptions,
): Promise<Connection> => {
    const projectName = getProjectName(options);

    // resolve the application address from the local node, if not provided
    const application =
        options.application ?? (await getApplicationAddress({ projectName }));
    if (!application) {
        throw new Error(
            `Unable to resolve the address of the application of project '${projectName}', make sure it is deployed, or define 'application'`,
        );
    }

    // connect to anvil, without prompting for the RPC URL
    const client =
        options.client ??
        (await connect({
            interactive: false,
            projectName,
            rpcUrl: options.rpcUrl,
        }));

    // the transaction sender, impersonated
    const from = options.from ?? (await client.getAddresses())[0];

    return { application, client, from, projectName };
};
