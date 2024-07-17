import Table from "cli-table3";

import { AddressBook as AddressBookType, BaseCommand } from "../baseCommand.js";

export default class AddressBook extends BaseCommand<typeof AddressBook> {
    static summary = "Prints addresses of smart contracts deployed.";

    static description =
        "Prints the addresses of all smart contracts deployed to the runtime environment of the application.";

    static examples = ["<%= config.bin %> <%= command.id %>"];

    public static enableJsonFlag = true;

    public async run(): Promise<AddressBookType> {
        const addressBook = await super.getAddressBook();
        if (!this.jsonEnabled()) {
            // print as a table
            const table = new Table({
                head: ["Contract", "Address"],
                chars: {
                    top: "",
                    "top-mid": "",
                    "top-left": "",
                    "top-right": "",
                    bottom: "",
                    "bottom-mid": "",
                    "bottom-left": "",
                    "bottom-right": "",
                    left: "",
                    "left-mid": "",
                    mid: "",
                    "mid-mid": "",
                    right: "",
                    "right-mid": "",
                    middle: " ",
                },
                style: { "padding-left": 0, "padding-right": 0 },
            });
            table.push(...Object.entries(addressBook));
            console.log(table.toString());
        }
        // return (as json)
        return addressBook;
    }
}
