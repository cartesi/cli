import { rollupsContracts } from "@cartesi/wagmi-plugin";
import { defineConfig } from "@wagmi/cli";

export default defineConfig({
    out: "src/contracts.ts",
    plugins: [rollupsContracts({ prt: true })],
});
