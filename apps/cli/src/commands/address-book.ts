import { Command } from "@commander-js/extra-typings";
import Table from "cli-table3";
import { getAddressBook } from "../base.js";

export const createAddressBookCommand = () => {
    return new Command("address-book")
        .description(
            "Prints the addresses of all smart contracts deployed to the runtime environment of the application.",
        )
        .option("--json", "Format output as json.")
        .action(async ({ json }) => {
            const addressBook = await getAddressBook();
            if (!json) {
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
            } else {
                // print as json
                process.stdout.write(JSON.stringify(addressBook));
            }
        });
};
