import { Config, Service } from "../types/compose.js";
import { DEFAULT_ENV, DEFAULT_HEALTHCHECK } from "./common.js";

// Rollups Node service
export const ROLLUPS_NODE_SVC: Service = {
    image: "cartesi/rollups-runtime:latest",
    depends_on: {
        database: { condition: "service_healthy" },
        anvil: { condition: "service_healthy" },
    },
    expose: ["10000", "10011", "10012"],
    healthcheck: {
        ...DEFAULT_HEALTHCHECK,
        test: ["CMD", "curl", "-fsS", "http://127.0.0.1:10000/livez"],
    },
    command: ["cartesi-rollups-node"],
    environment: DEFAULT_ENV,
    volumes: ["./.cartesi:/var/lib/cartesi-rollups-node/snapshots:ro"],
};

// Rollups Node proxy configuration
export const ROLLUPS_NODE_PROXY_CFG: Config = {
    name: "rollups-node-proxy",
    content: `
http:
    routers:
        inspect_server:
            rule: "PathPrefix(\`/inspect\`)"
            service: inspect_server
        rpc_server:
            rule: "PathPrefix(\`/rpc\`)"
            service: rpc_server
    services:
        inspect_server:
            loadBalancer:
                servers:
                    - url: "http://rollups-node:10012"
        rpc_server:
            loadBalancer:
                servers:
                    - url: "http://rollups-node:10011"
`,
};
