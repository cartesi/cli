import chalk from "chalk";
import {
    type Address,
    createPublicClient,
    getAddress,
    http,
    type HttpTransport,
    isAddress,
    type PublicClient,
} from "viem";
import { getServiceState } from "./base.js";
import { getApplicationAddress, getProjectPort } from "./exec/rollups.js";

/**
 * Create a read-only client for the anvil of the local environment
 * @param options projectName
 */
// the return type is explicit because the one inferred by createPublicClient
// cannot be named from outside viem, which breaks declaration emit
export const getAnvilClient = async (options: {
    projectName: string;
}): Promise<PublicClient<HttpTransport>> => {
    const host = await getProjectPort(options);
    return createPublicClient({ transport: http(`http://${host}/anvil`) });
};

/**
 * Resolve the application a command acts on, making sure the local
 * environment is running
 * @returns address of the given application, or of the one deployed for the current machine
 */
export const resolveNodeApplication = async (options: {
    application?: string;
    io?: {
        getApplicationAddress: typeof getApplicationAddress;
        getServiceState: typeof getServiceState;
    };
    projectName: string;
}): Promise<Address> => {
    const {
        application,
        io = { getApplicationAddress, getServiceState },
        projectName,
    } = options;

    const state = await io.getServiceState({
        projectName,
        service: "rollups_node",
    });
    if (state !== "running") {
        throw new Error(
            `${chalk.cyan(projectName)} is not running, use ${chalk.cyan("cartesi run")}`,
        );
    }

    if (application) {
        if (!isAddress(application)) {
            throw new Error(`Invalid application address ${application}`);
        }
        return getAddress(application);
    }

    const address = await io.getApplicationAddress({ projectName });
    if (!address) {
        throw new Error(
            `No application deployed for the current machine, use ${chalk.cyan("--application")}`,
        );
    }
    return address;
};
