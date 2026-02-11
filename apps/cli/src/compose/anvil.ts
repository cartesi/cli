import type { ForkConfig } from "../commands/run.js";
import type { ComposeFile, Config, Service } from "../types/compose.js";
import { DEFAULT_HEALTHCHECK } from "./common.js";

type ServiceOptions = {
    imageTag?: string;
    blockTime?: number;
    forkConfig?: ForkConfig;
};

// Anvil service
const service = (options?: ServiceOptions): Service => {
    const blockTime = options?.blockTime ?? 2;
    const imageTag = options?.imageTag ?? "latest";
    const forkConfig = options?.forkConfig;

    // command for fork and command for load-state local (non-fork)
    const command = forkConfig
        ? [
              "anvil",
              "--chain-id",
              "31337",
              "--block-time",
              blockTime.toString(),
              "--fork-url",
              forkConfig.url,
              ...(forkConfig.blockNumber !== undefined
                  ? ["--fork-block-number", forkConfig.blockNumber.toString()]
                  : []),
          ]
        : ["devnet", "--block-time", blockTime.toString()];

    // in case of forked network service is ready only when it responds with target block number
    const test = forkConfig?.blockNumber
        ? ["CMD", "eth_isready", forkConfig.blockNumber?.toString()]
        : ["CMD", "eth_isready"];

    return {
        image: `cartesi/sdk:${imageTag}`,
        command,
        healthcheck: {
            ...DEFAULT_HEALTHCHECK,
            test,
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
