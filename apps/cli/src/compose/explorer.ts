import type { ComposeFile, Config, Service } from "../types/compose.js";
import { DEFAULT_HEALTHCHECK } from "./common.js";

type ServiceOptions = {
    imageTag?: string;
    port?: number;
};

// Explorer service
export const explorerService = (options: ServiceOptions): Service => {
    const imageTag = options.imageTag ?? "latest";
    const port = options.port ?? 6571;

    const nodeRpcUrl = `http://127.0.0.1:${port}/anvil`;
    const cartesiNodeRpcUrl = `http://127.0.0.1:${port}/rpc`;

    return {
        image: `cartesi/rollups-explorer:${imageTag}`,
        environment: {
            NODE_RPC_URL: nodeRpcUrl,
            CARTESI_NODE_RPC_URL: cartesiNodeRpcUrl,
        },
        expose: ["3000"],
        healthcheck: {
            ...DEFAULT_HEALTHCHECK,
            test: [
                "CMD",
                "wget",
                "--spider",
                "-q",
                `http://127.0.0.1:3000/explorer/api/healthz`,
            ],
        },

        depends_on: {
            anvil: { condition: "service_healthy" },
            rollups_node: { condition: "service_healthy" },
        },
    };
};

// Explorer Proxy configuration
export const explorerProxyConfig = (): Config => {
    return {
        name: "explorer-proxy",
        content: `http:
    routers:
        explorer:
            rule: "PathPrefix(\`/explorer\`)"
            service: explorer
    services:
        explorer:
            loadBalancer:
                servers:
                    - url: "http://explorer:3000"`,
    };
};

export default (options: ServiceOptions): ComposeFile => ({
    configs: {
        explorer_proxy: explorerProxyConfig(),
    },
    services: {
        explorer: explorerService(options),
        proxy: {
            configs: [
                {
                    source: "explorer_proxy",
                    target: "/etc/traefik/conf.d/explorer.yaml",
                },
            ],
        },
    },
});
