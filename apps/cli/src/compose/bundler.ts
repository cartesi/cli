import { Config, Service } from "../types/compose.js";
import { DEFAULT_HEALTHCHECK } from "./common.js";

export const BUNDLER_SVC: Service = {
    image: "cartesi/sdk:latest",
    command: [
        "alto",
        "--entrypoints",
        "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789,0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        "--log-level",
        "info",
        "--rpc-url",
        "http://anvil:8545",
        "--min-executor-balance",
        "0",
        "--utility-private-key",
        "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
        "--executor-private-keys",
        "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6,0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356,0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e,0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba,0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
        "--safe-mode",
        "false",
        "--port",
        "4337",
        "--public-client-log-level",
        "error",
        "--wallet-client-log-level",
        "error",
        "--enable-debug-endpoints",
    ],
    healthcheck: {
        ...DEFAULT_HEALTHCHECK,
        test: ["CMD", "curl", "-fsS", "http://127.0.0.1:4337/health"],
    },
};

export const BUNDLER_PROXY_CFG: Config = {
    name: "bundler-proxy",
    content: `http:
    routers:
        bundler:
            rule: "PathPrefix(\`/bundler\`)"
            middlewares:
                - "cors"
                - "remove-bundler-prefix"
            service: bundler
    middlewares:
        cors:
            headers:
                accessControlAllowMethods:
                    - GET
                    - OPTIONS
                    - PUT
                accessControlAllowHeaders: "*"
                accessControlAllowOriginList:
                    - "*"
                accessControlMaxAge: 100
                addVaryHeader: true
        remove-bundler-prefix:
            replacePathRegex:
                regex: "^/bundler/(.*)"
                replacement: "/$1"
    services:
        bundler:
            loadBalancer:
                servers:
                    - url: "http://bundler:4337"`,
};
