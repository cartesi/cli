import type { ComposeFile, Config, Service } from "../types/compose.js";
import { DEFAULT_HEALTHCHECK } from "./common.js";

type ServiceOptions = {
    imageTag?: string;
};

// Passkey Server service
export const service = (options: ServiceOptions): Service => {
    const imageTag = options.imageTag ?? "latest";

    return {
        image: `cartesi/sdk:${imageTag}`,
        command: ["passkey-server"],
        healthcheck: {
            ...DEFAULT_HEALTHCHECK,
            test: ["CMD", "curl", "-fsS", "http://127.0.0.1:3000/health"],
        },
    };
};

// Passkey Proxy configuration
const proxy = (): Config => {
    return {
        name: "passkey-proxy",
        content: `http:
    routers:
        passkey_server:
            rule: "PathPrefix(\`/passkey\`)"
            middlewares:
                - "remove-passkey-server-prefix"
            service: passkey_server
    middlewares:
        remove-passkey-server-prefix:
            replacePathRegex:
                regex: "^/passkey/(.*)"
                replacement: "/$1"
    services:
        passkey_server:
            loadBalancer:
                servers:
                    - url: "http://passkey_server:3000"`,
    };
};

export default (options: ServiceOptions): ComposeFile => ({
    configs: {
        passkey_server_proxy: proxy(),
    },
    services: {
        passkey_server: service(options),
        proxy: {
            configs: [
                {
                    source: "passkey_server_proxy",
                    target: "/etc/traefik/conf.d/passkey_server.yaml",
                },
            ],
        },
    },
});
