import { Config, Service } from "../types/compose.js";
import { DEFAULT_HEALTHCHECK } from "./common.js";

// Passkey Server service
export const PASSKEY_SVC: Service = {
    image: "cartesi/sdk:latest",
    command: ["passkey-server"],
    healthcheck: {
        ...DEFAULT_HEALTHCHECK,
        test: ["CMD", "curl", "-fsS", "http://127.0.0.1:3000/health"],
    },
};

// Passkey Proxy configuration
export const PASSKEY_PROXY_CFG: Config = {
    name: "passkey-proxy",
    content: `http:
    routers:
        passkey-server:
            rule: "PathPrefix(\`/passkey\`)"
            middlewares:
                - "remove-passkey-server-prefix"
            service: passkey-server
    middlewares:
        remove-passkey-server-prefix:
            replacePathRegex:
                regex: "^/passkey/(.*)"
                replacement: "/$1"
    services:
        passkey-server:
            loadBalancer:
                servers:
                    - url: "http://passkey-server:3000"`,
};
