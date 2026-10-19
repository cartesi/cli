import { defineConfig } from "../../../../../src/defineConfig.js";

export default defineConfig(async ({ command, mode }) => ({
    machine: { entrypoint: `${command}:${mode}` },
    run: { epochLength: command === "run" ? 10 : 720 },
}));
