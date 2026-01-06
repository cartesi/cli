import type { ComposeFile, Config, Service } from "../types/compose.js";
import { DEFAULT_HEALTHCHECK } from "./common.js";

type ServiceOptions = {
    imageTag?: string;
};

const service = (options: ServiceOptions): Service => {
    const imageTag = options.imageTag ?? "latest";

    return {
        image: `cartesi/sdk:${imageTag}`,
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
};

const proxy = (): Config => {
    return {
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
};

export default (options: ServiceOptions): ComposeFile => ({
    configs: {
        paymaster_proxy: proxy(),
    },
    services: {
        paymaster: service(options),
        proxy: {
            configs: [
                {
                    source: "paymaster_proxy",
                    target: "/etc/traefik/conf.d/paymaster.yaml",
                },
            ],
        },
    },
});
