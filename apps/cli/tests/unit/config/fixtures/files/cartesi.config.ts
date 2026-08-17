import { defineConfig } from "../../../../../src/defineConfig.js";

export default defineConfig({
    drives: {
        data: { builder: "empty", size: "64Mb" },
    },
    machine: { entrypoint: "dapp", ramLength: "256Mi" },
    run: { epochLength: 10 },
    sdk: "my/sdk:1.0.0",
});
