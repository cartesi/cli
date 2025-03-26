import { defineChain } from "viem";
import { cannon } from "viem/chains";
import { createConfig, http } from "wagmi";
import { metaMask } from "wagmi/connectors";

import { getEnvUrl } from "./env";

export const cartesi = defineChain({
    ...cannon,
    name: "Cartesi Devnet",
    rpcUrls: { default: { http: [`${getEnvUrl()}anvil`] } },
});

export const config = createConfig({
    chains: [cartesi],
    connectors: [metaMask()],
    transports: {
        [cartesi.id]: http(),
    },
});

declare module "wagmi" {
    interface Register {
        config: typeof config;
    }
}
