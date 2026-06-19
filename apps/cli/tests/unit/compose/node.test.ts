import { describe, expect, it } from "bun:test";
import buildNodeCompose, {
    getNodeAllowedVariables,
    nodeAllowedEnvironmentVariables,
    type ServiceOptions,
} from "../../../src/compose/node.js";
import {
    inputBoxAddress,
    selfHostedApplicationFactoryAddress,
} from "../../../src/contracts.js";

describe("Compose node service", () => {
    describe("Node allowed environment variables", () => {
        it("should match the exact fixed list of allowed variable names", () => {
            expect(nodeAllowedEnvironmentVariables).toEqual([
                "CARTESI_AUTH_MNEMONIC",
                "CARTESI_AUTH_MNEMONIC_ACCOUNT_INDEX",
                "CARTESI_BLOCKCHAIN_DEFAULT_BLOCK",
                "CARTESI_BLOCKCHAIN_HTTP_AUTHORIZATION",
                "CARTESI_BLOCKCHAIN_HTTP_ENDPOINT",
                "CARTESI_BLOCKCHAIN_ID",
                "CARTESI_CONTRACTS_APPLICATION_FACTORY_ADDRESS",
                "CARTESI_CONTRACTS_AUTHORITY_FACTORY_ADDRESS",
                "CARTESI_CONTRACTS_DAVE_APP_FACTORY_ADDRESS",
                "CARTESI_CONTRACTS_INPUT_BOX_ADDRESS",
                "CARTESI_CONTRACTS_QUORUM_FACTORY_ADDRESS",
                "CARTESI_CONTRACTS_SELF_HOSTED_APPLICATION_FACTORY_ADDRESS",
                "CARTESI_DATABASE_CONNECTION",
                "CARTESI_LOG_LEVEL",
                "CARTESI_LOG_LEVEL_ADVANCER",
                "CARTESI_LOG_LEVEL_CLAIMER",
                "CARTESI_LOG_LEVEL_EVM_READER",
                "CARTESI_LOG_LEVEL_JSONRPC_API",
                "CARTESI_LOG_LEVEL_PRT",
                "CARTESI_LOG_LEVEL_VALIDATOR",
                "CARTESI_JSONRPC_MACHINE_LOG_LEVEL",
                "CARTESI_SNAPSHOTS_DIR",
            ]);
        });
    });

    describe("getNodeAllowedVariables function", () => {
        it("should return an empty object when called with no arguments", () => {
            expect(getNodeAllowedVariables()).toEqual({});
        });

        it("should return an empty object when called with undefined", () => {
            expect(getNodeAllowedVariables(undefined)).toEqual({});
        });

        it("should return an empty object when input has no matching keys", () => {
            const result = getNodeAllowedVariables({
                FOO: "bar",
                SOME_OTHER_VAR: "value",
            });
            expect(result).toEqual({});
        });

        it("should return only allowed variables from the input", () => {
            const result = getNodeAllowedVariables({
                CARTESI_LOG_LEVEL: "debug",
                CARTESI_SNAPSHOTS_DIR: "/tmp/snapshots",
                FOO: "should-be-excluded",
            });

            expect(result).toStrictEqual({
                CARTESI_LOG_LEVEL: "debug",
                CARTESI_SNAPSHOTS_DIR: "/tmp/snapshots",
            });
            expect(result).not.toHaveProperty("FOO");
        });

        it("should exclude variables with undefined values", () => {
            const input: Record<string, string> = {
                CARTESI_LOG_LEVEL: "info",
            };
            // Simulate a key present but set to undefined via coercion
            (input as Record<string, unknown>).CARTESI_SNAPSHOTS_DIR =
                undefined;

            const result = getNodeAllowedVariables(input);
            expect(result).toEqual({ CARTESI_LOG_LEVEL: "info" });
            expect(result).not.toHaveProperty("CARTESI_SNAPSHOTS_DIR");
        });

        it("should exclude variables with null values", () => {
            const input: Record<string, unknown> = {
                CARTESI_LOG_LEVEL: "warn",
                CARTESI_DATABASE_CONNECTION: null,
            };

            const result = getNodeAllowedVariables(
                input as Record<string, string>,
            );
            expect(result).toEqual({ CARTESI_LOG_LEVEL: "warn" });
            expect(result).not.toHaveProperty("CARTESI_DATABASE_CONNECTION");
        });

        it("should pass through all allowed variables when every allowed key is present", () => {
            const input = Object.fromEntries(
                nodeAllowedEnvironmentVariables.map((k) => [k, `value-${k}`]),
            );
            const result = getNodeAllowedVariables(input);
            expect(Object.keys(result).sort()).toEqual(
                [...nodeAllowedEnvironmentVariables].sort(),
            );
        });

        it("should not include non-CARTESI_ keys even if they look similar", () => {
            const result = getNodeAllowedVariables({
                CARTESI_LOG_LEVEL: "info",
                XCARTESI_LOG_LEVEL: "debug",
                CARTESI_LOG_LEVEL_EXTRA: "warn", // not in allow-list
            });

            expect(result).toEqual({ CARTESI_LOG_LEVEL: "info" });
            expect(result).not.toHaveProperty("XCARTESI_LOG_LEVEL");
            expect(result).not.toHaveProperty("CARTESI_LOG_LEVEL_EXTRA");
        });

        it("should preserve original string values without transformation", () => {
            const result = getNodeAllowedVariables({
                CARTESI_AUTH_MNEMONIC: "test test test junk",
                CARTESI_BLOCKCHAIN_ID: "31337",
            });
            expect(result.CARTESI_AUTH_MNEMONIC).toBe("test test test junk");
            expect(result.CARTESI_BLOCKCHAIN_ID).toBe("31337");
        });
    });

    describe("Node service builder (buildNodeCompose)", () => {
        const baseOptions: ServiceOptions = {
            databasePassword: "secret",
            databaseHost: "db",
            databasePort: 5432,
            defaultBlock: "latest",
            imageTag: "latest",
            logLevel: "info",
        };

        it("should return a compose file config with configs related to the rollups_node_proxy", () => {
            const compose = buildNodeCompose(baseOptions);

            expect(compose.configs).toHaveProperty("rollups_node_proxy");
            const proxyConfig = compose.configs?.rollups_node_proxy;
            expect(proxyConfig).toHaveProperty("content");
        });
        it("should return a compose file config with services including rollups_node and proxy services", () => {
            const compose = buildNodeCompose(baseOptions);
            expect(compose.services).toHaveProperty("rollups_node");
            expect(compose.services).toHaveProperty("proxy");
        });

        it("should include the rollups-node config in proxy service", () => {
            const compose = buildNodeCompose(baseOptions);
            const proxyConfigs = compose.services?.proxy?.configs ?? [];

            expect(proxyConfigs).toHaveLength(1);
            expect(proxyConfigs).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        source: "rollups_node_proxy",
                        target: "/etc/traefik/conf.d/rollups-node.yaml",
                    }),
                ]),
            );
        });

        it("should set the rollups_node image using the provided imageTag", () => {
            const compose = buildNodeCompose({
                ...baseOptions,
                imageTag: "1.2.3",
            });
            expect(compose.services?.rollups_node?.image).toBe(
                "cartesi/rollups-runtime:1.2.3",
            );
        });

        it("should default to latest image tag when imageTag is omitted", () => {
            const compose = buildNodeCompose(baseOptions);
            expect(compose.services?.rollups_node?.image).toBe(
                "cartesi/rollups-runtime:latest",
            );
        });

        it("should pass sensible environment variables defaults for the rollups_node service", () => {
            const compose = buildNodeCompose(baseOptions);

            const env = compose.services?.rollups_node?.environment ?? {};

            expect(Object.keys(env)).toHaveLength(10);

            expect(env).toHaveProperty(
                "CARTESI_AUTH_MNEMONIC",
                "test test test test test test test test test test test junk",
            );

            expect(env).toHaveProperty(
                "CARTESI_AUTH_MNEMONIC_ACCOUNT_INDEX",
                "0",
            );
            expect(env).toHaveProperty(
                "CARTESI_BLOCKCHAIN_DEFAULT_BLOCK",
                "latest",
            );
            expect(env).toHaveProperty(
                "CARTESI_BLOCKCHAIN_HTTP_ENDPOINT",
                "http://anvil:8545",
            );
            expect(env).toHaveProperty("CARTESI_BLOCKCHAIN_ID", "31337");
            expect(env).toHaveProperty(
                "CARTESI_CONTRACTS_INPUT_BOX_ADDRESS",
                inputBoxAddress,
            );
            expect(env).toHaveProperty(
                "CARTESI_CONTRACTS_SELF_HOSTED_APPLICATION_FACTORY_ADDRESS",
                selfHostedApplicationFactoryAddress,
            );
            expect(env).toHaveProperty(
                "CARTESI_DATABASE_CONNECTION",
                "postgres://postgres:secret@db:5432/rollupsdb?sslmode=disable",
            );
            expect(env).toHaveProperty("CARTESI_LOG_LEVEL", "info");
            expect(env).toHaveProperty(
                "CARTESI_SNAPSHOTS_DIR",
                "/var/lib/cartesi-rollups-node/snapshots",
            );
        });

        it("should pass cartesiEnvironmentVariables that are in the allow-list to the service", () => {
            const compose = buildNodeCompose({
                ...baseOptions,
                cartesiEnvironmentVariables: {
                    CARTESI_AUTH_MNEMONIC_ACCOUNT_INDEX: "5",
                    CARTESI_LOG_LEVEL: "debug",
                    CARTESI_SNAPSHOTS_DIR: "/tmp/snapshots",
                    NOT_ALLOWED: "should-be-dropped",
                },
            });
            const env = compose.services?.rollups_node?.environment ?? {};

            expect(env).toHaveProperty(
                "CARTESI_AUTH_MNEMONIC_ACCOUNT_INDEX",
                "5",
            );
            expect(env).toHaveProperty("CARTESI_LOG_LEVEL", "debug");
            expect(env).toHaveProperty(
                "CARTESI_SNAPSHOTS_DIR",
                "/tmp/snapshots",
            );
            expect(env).not.toHaveProperty("NOT_ALLOWED");
        });

        it("should override default env vars with allowed-cartesi-environment-variables that are provided", () => {
            const compose = buildNodeCompose({
                ...baseOptions,
                logLevel: "info",
                cartesiEnvironmentVariables: {
                    CARTESI_LOG_LEVEL: "warn",
                },
            });
            const env = compose.services?.rollups_node?.environment ?? {};
            expect(env).toHaveProperty("CARTESI_LOG_LEVEL", "warn");
        });

        it("should build the database connection string from provided property", () => {
            const compose = buildNodeCompose({
                databasePassword: "specialsecret",
            });
            const env = compose.services?.rollups_node?.environment ?? {};
            expect(env).toHaveProperty(
                "CARTESI_DATABASE_CONNECTION",
                "postgres://postgres:specialsecret@database:5432/rollupsdb?sslmode=disable",
            );
        });
    });
});
