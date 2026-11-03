import { Command } from "@commander-js/extra-typings";
import Table from "cli-table3";
import { addressBook as getAddressBook } from "../api/address-book.js";

export const createAddressBookCommand = () => {
    return new Command("address-book")
        .description(
            "Prints the addresses of all smart contracts deployed to the runtime environment of the application.",
        )
        .argument(
            "[contract]",
            "name of a contract; when provided, prints only its address (useful for scripting)",
        )
        .option("--json", "Format output as json.")
        .option(
            "--project-name <string>",
            "name of project (used by docker compose and cartesi-rollups-node)",
        )
        .action(async (contract, options, command) => {
            const { json } = options;
            const addressBook = await getAddressBook(options);

            if (contract !== undefined) {
                // look up a single contract by name (case-insensitive)
                const entry = Object.entries(addressBook).find(
                    ([name]) => name.toLowerCase() === contract.toLowerCase(),
                );
                if (!entry) {
                    command.error(`Contract not found: ${contract}`);
                    return;
                }
                const [, address] = entry;
                if (!json) {
                    // print only the address, for easy shell integration
                    console.log(address);
                } else {
                    process.stdout.write(JSON.stringify(address));
                }
                return;
            }

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
