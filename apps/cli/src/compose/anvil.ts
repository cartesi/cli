import type { ComposeFile, Config, Service } from "../types/compose.js";
import { DEFAULT_HEALTHCHECK } from "./common.js";

type ServiceOptions = {
    imageTag?: string;
    blockTime?: number;
};

// Anvil service
const service = (options?: ServiceOptions): Service => {
    const blockTime = options?.blockTime ?? 2;
    const imageTag = options?.imageTag ?? "latest";

    return {
        image: `cartesi/sdk:${imageTag}`,
        command: ["devnet", "--block-time", blockTime.toString()],
        healthcheck: {
            ...DEFAULT_HEALTHCHECK,
            test: ["CMD", "eth_isready"],
        },
        environment: {
            ANVIL_IP_ADDR: "0.0.0.0",
        },
    };
};

const proxy = (): Config => ({
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
});

export default (options?: ServiceOptions): ComposeFile => ({
    configs: {
        anvil_proxy: proxy(),
    },
    services: {
        anvil: service(options),
        proxy: {
            configs: [
                {
                    source: "anvil_proxy",
                    target: "/etc/traefik/conf.d/anvil.yaml",
                },
            ],
        },
    },
});
