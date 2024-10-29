import { Command } from "@commander-js/extra-typings";
import fs from "fs-extra";
import { getContextPath } from "../base.js";

export const createCleanCommand = () => {
    return new Command("clean")
        .description("Deletes all cached build artifacts of application.")
        .action(async () => {
            await fs.emptyDir(getContextPath());
        });
};
