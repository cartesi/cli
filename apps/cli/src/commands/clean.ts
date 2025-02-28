import { Command } from "@commander-js/extra-typings";
import fs from "fs-extra";
import { getContextPath } from "../base.js";

export const registerCleanCommand = (program: Command) => {
    program
        .command("clean")
        .description("Deletes all cached build artifacts of application.")
        .action(async () => {
            await fs.emptyDir(getContextPath());
        });
};
