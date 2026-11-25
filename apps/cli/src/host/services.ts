import type { ProcessSpec } from "./process.js";

/**
 * The optional services of the environment, each one a tool installed on the
 * host: the ones the SDK image installs with `npm install -g`.
 */

/** Keys of the devnet accounts the bundler executes and pays with. */
const BUNDLER_UTILITY_KEY =
    "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97";
const BUNDLER_EXECUTOR_KEYS = [
    "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
    "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
    "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
    "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
    "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
];

/** The ERC-4337 entrypoints, v0.6 and v0.7, which the devnet has. */
const ENTRYPOINTS =
    "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789,0x0000000071727De22E5E9d8BAf0edAc6f37da032";

export const bundlerProcess = (options: {
    anvilUrl: string;
    port: number;
}): ProcessSpec => ({
    args: [
        "--entrypoints",
        ENTRYPOINTS,
        "--log-level",
        "info",
        "--rpc-url",
        options.anvilUrl,
        "--min-executor-balance",
        "0",
        "--utility-private-key",
        BUNDLER_UTILITY_KEY,
        "--executor-private-keys",
        BUNDLER_EXECUTOR_KEYS.join(","),
        "--safe-mode",
        "false",
        "--port",
        options.port.toString(),
        "--public-client-log-level",
        "error",
        "--wallet-client-log-level",
        "error",
        "--enable-debug-endpoints",
    ],
    command: "alto",
    name: "bundler",
});

export const paymasterProcess = (options: {
    anvilUrl: string;
    bundlerUrl: string;
    port: number;
}): ProcessSpec => ({
    args: [],
    command: "mock-verifying-paymaster",
    env: {
        ALTO_RPC: options.bundlerUrl,
        ANVIL_RPC: options.anvilUrl,
        PORT: options.port.toString(),
    },
    name: "paymaster",
});

export const passkeyProcess = (options: { port: number }): ProcessSpec => ({
    args: ["--port", options.port.toString()],
    command: "passkey-server",
    name: "passkey_server",
});
