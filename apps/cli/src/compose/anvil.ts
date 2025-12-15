import { Config, Service } from "../types/compose.js";
import { DEFAULT_HEALTHCHECK } from "./common.js";

// Anvil service
export const ANVIL_SVC: Service = {
    image: "cartesi/sdk:latest",
    command: ["devnet"],
    healthcheck: {
        ...DEFAULT_HEALTHCHECK,
        test: ["CMD", "eth_isready"],
    },
    environment: {
        ANVIL_IP_ADDR: "0.0.0.0",
    },
};

export const ANVIL_PROXY_CONFIG: Config = {
    name: "anvil-proxy",
    content: `http:
    routers:
        anvil:
            rule: "PathPrefix(\`/anvil\`)"
            middlewares:
                - "remove-anvil-prefix"
            service: anvil
    middlewares:
        remove-anvil-prefix:
            replacePathRegex:
                regex: "^/anvil(.*)"
                replacement: "$1"
    services:
        anvil:
            loadBalancer:
                servers:
                    - url: "http://anvil:8545"`,
};
