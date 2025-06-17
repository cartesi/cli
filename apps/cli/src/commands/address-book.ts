import { Command } from "@commander-js/extra-typings";
import Table from "cli-table3";
import { getAddressBook, getProjectName } from "../base.js";

export const createAddressBookCommand = () => {
    return new Command("address-book")
        .description(
            "Prints the addresses of all smart contracts deployed to the runtime environment of the application.",
        )
        .option("--json", "Format output as json.")
        .option(
            "--project-name <string>",
            "name of project (used by docker compose and cartesi-rollups-node)",
        )
        .action(async (options) => {
            const { json } = options;
            const projectName = getProjectName(options);
            const addressBook = await getAddressBook({ projectName });
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
