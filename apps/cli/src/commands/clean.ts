import { Command } from "@commander-js/extra-typings";
import { clean } from "../api/clean.js";

export const createCleanCommand = () => {
    return new Command("clean")
        .description("Deletes all cached build artifacts of application.")
        .action(async () => {
            await clean();
        });
};
