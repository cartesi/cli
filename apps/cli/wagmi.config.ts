import { prtInternals, rollupsContracts } from "@cartesi/wagmi-plugin";
import { defineConfig } from "@wagmi/cli";

export default defineConfig({
    out: "src/contracts.ts",
    plugins: [
        // the PRT internals are reached through the interfaces they implement,
        // or have nothing callable at all, and wagmi repeats each ABI type per
        // contract member, so generating them is pure weight
        rollupsContracts({ prt: true, exclude: prtInternals }),
    ],
});
