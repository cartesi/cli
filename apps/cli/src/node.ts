import {
    type CartesiPublicClient,
    createCartesiPublicClient,
} from "@cartesi/client";
import { InvalidArgumentError } from "@commander-js/extra-typings";
import chalk from "chalk";
import { type Address, getAddress, http, isAddress } from "viem";
import { getServiceState } from "./base.js";
import { getApplicationAddress, getProjectPort } from "./exec/rollups.js";

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
 * Resolve the application a command acts on, making sure the local
 * environment is running
 * @returns address of the given application, or of the one deployed for the current machine
 */
export const resolveNodeApplication = async (options: {
    application?: string;
    projectName: string;
}): Promise<Address> => {
    const { application, projectName } = options;

    const state = await getServiceState({
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

    const address = await getApplicationAddress({ projectName });
    if (!address) {
        throw new Error(
            `No application deployed for the current machine, use ${chalk.cyan("--application")}`,
        );
    }
    return address;
};

/**
 * Commander parser of a mnemonic account index
 */
export const parseAccountIndex = (value: string): number => {
    const index = Number(value);
    if (!Number.isSafeInteger(index) || index < 0) {
        throw new InvalidArgumentError("Not a valid account index.");
    }
    return index;
};
