import { Config, Service } from "../types/compose.js";
import { DEFAULT_HEALTHCHECK } from "./common.js";

// Paymaster service
export const PAYMASTER_SVC: Service = {
    image: "cartesi/sdk:latest",
    command: "mock-verifying-paymaster",
    environment: {
        ALTO_RPC: "http://bundler:4337",
        ANVIL_RPC: "http://anvil:8545",
    },
    healthcheck: {
        ...DEFAULT_HEALTHCHECK,
        test: ["CMD", "curl", "-fsS", "http://127.0.0.1:3000/ping"],
    },
};

// Paymaster Proxy configuration
export const PAYMASTER_PROXY_CFG: Config = {
    name: "paymaster-proxy",
    content: `http:
    routers:
        paymaster:
            rule: "PathPrefix(\`/paymaster\`)"
            middlewares:
                - "remove-paymaster-prefix"
            service: paymaster
    middlewares:
        remove-paymaster-prefix:
            replacePathRegex:
                regex: "^/paymaster/(.*)"
                replacement: "/$1"
    services:
        paymaster:
            loadBalancer:
                servers:
                    - url: "http://paymaster:3000"`,
};
