import {
    type CartesiPublicClient,
    createCartesiPublicClient,
} from "@cartesi/client";
import {
    type Command,
    InvalidArgumentError,
    Option,
    type OptionValues,
} from "@commander-js/extra-typings";
import chalk from "chalk";
import {
    type Address,
    createPublicClient,
    getAddress,
    http,
    isAddress,
} from "viem";
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
 * Create a read-only client for the anvil of the local environment
 * @param options projectName
 */
export const getAnvilClient = async (options: { projectName: string }) => {
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

/**
 * Add the options shared by the fund recovery commands: the application and
 * project, the signer account index, and the transaction flags forwarded to
 * cartesi-rollups-cli
 * @param accountIndexDescription what the account index selects for this command
 */
export const addRecoveryOptions = <
    Args extends unknown[],
    Opts extends OptionValues,
    GlobalOpts extends OptionValues,
>(
    command: Command<Args, Opts, GlobalOpts>,
    accountIndexDescription: string,
) =>
    command
        .option("--application <address>", "application address")
        .option(
            "--project-name <string>",
            "name of project (used by docker compose and cartesi-rollups-node)",
        )
        .addOption(
            new Option(
                "--account-index <index>",
                accountIndexDescription,
            ).argParser(parseAccountIndex),
        )
        .option("-y, --yes", "skip the confirmation prompt")
        .option("--json", "print the result as JSON")
        .option(
            "--no-wait",
            "return after broadcast without waiting for the receipt",
        )
        .option(
            "--wait-timeout <duration>",
            "maximum time to wait for the receipt (e.g. 30s, 5m)",
        );
