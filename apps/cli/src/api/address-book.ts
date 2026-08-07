import { type AddressBook, getAddressBook, getProjectName } from "../base.js";

export type AddressBookOptions = {
    /**
     * Name of the project (used by docker compose and cartesi-rollups-node).
     * @default basename of the current working directory
     */
    projectName?: string;
};

/**
 * Get the addresses of all smart contracts deployed to the runtime environment
 * of the application, indexed by contract name.
 * @param options address book options
 * @returns map of contract name to contract address
 */
export const addressBook = async (
    options: AddressBookOptions = {},
): Promise<AddressBook> => {
    const projectName = getProjectName(options);
    return getAddressBook({ projectName });
};

export type { AddressBook };
