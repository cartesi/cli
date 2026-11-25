import { describe, expect, it } from "bun:test";
import {
    DEVNET_MNEMONIC,
    getNodeAllowedVariables,
    type NodeOptions,
    nodeAllowedEnvironmentVariables,
    nodeEnvironment,
} from "../../../src/host/node.js";
import {
    applicationFactoryAddress,
    inputBoxAddress,
    selfHostedApplicationFactoryAddress,
} from "../../../src/contracts.js";

describe("Host node service", () => {
    describe("Node allowed environment variables", () => {
        it("should match the exact fixed list of allowed variable names", () => {
            expect(nodeAllowedEnvironmentVariables).toEqual([
                "CARTESI_AUTH_KIND",
                "CARTESI_AUTH_MNEMONIC",
                "CARTESI_AUTH_MNEMONIC_ACCOUNT_INDEX",
                "CARTESI_AUTH_MNEMONIC_FILE",
                "CARTESI_AUTH_PRIVATE_KEY",
                "CARTESI_AUTH_PRIVATE_KEY_FILE",
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
                "CARTESI_PRT_AUTH_KIND",
                "CARTESI_PRT_AUTH_MNEMONIC",
                "CARTESI_PRT_AUTH_MNEMONIC_ACCOUNT_INDEX",
                "CARTESI_PRT_AUTH_MNEMONIC_FILE",
                "CARTESI_PRT_AUTH_PRIVATE_KEY",
                "CARTESI_PRT_AUTH_PRIVATE_KEY_FILE",
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

        it("should pass the claimer auth variables through and drop the kms key id", () => {
            const result = getNodeAllowedVariables({
                CARTESI_AUTH_KIND: "private_key",
                CARTESI_AUTH_PRIVATE_KEY: "0xkey",
                CARTESI_PRT_AUTH_AWS_KMS_KEY_ID: "alias/signer",
            });

            expect(result).toStrictEqual({
                CARTESI_AUTH_KIND: "private_key",
                CARTESI_AUTH_PRIVATE_KEY: "0xkey",
            });
            // the aws kind cannot be configured through CARTESI_ variables
            expect(result).not.toHaveProperty(
                "CARTESI_PRT_AUTH_AWS_KMS_KEY_ID",
            );
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

    describe("nodeEnvironment", () => {
        const options: NodeOptions = {
            anvilUrl: "http://127.0.0.1:8545",
            cwd: "/app",
            databaseUrl: "postgres://postgres:secret@127.0.0.1:5432/rollupsdb",
            ports: { inspect: 10012, jsonrpc: 10011, telemetry: 10000 },
            snapshotsDir: "/app/.cartesi",
        };

        it("should configure the node for the devnet of the environment", () => {
            expect(nodeEnvironment(options)).toEqual({
                CARTESI_AUTH_MNEMONIC: DEVNET_MNEMONIC,
                CARTESI_AUTH_MNEMONIC_ACCOUNT_INDEX: "0",
                CARTESI_BLOCKCHAIN_DEFAULT_BLOCK: "latest",
                CARTESI_BLOCKCHAIN_HTTP_ENDPOINT: "http://127.0.0.1:8545",
                CARTESI_BLOCKCHAIN_ID: "31337",
                CARTESI_CONTRACTS_APPLICATION_FACTORY_ADDRESS:
                    applicationFactoryAddress,
                CARTESI_CONTRACTS_INPUT_BOX_ADDRESS: inputBoxAddress,
                CARTESI_CONTRACTS_SELF_HOSTED_APPLICATION_FACTORY_ADDRESS:
                    selfHostedApplicationFactoryAddress,
                CARTESI_DATABASE_CONNECTION:
                    "postgres://postgres:secret@127.0.0.1:5432/rollupsdb",
                CARTESI_INSPECT_ADDRESS: "127.0.0.1:10012",
                CARTESI_JSONRPC_API_ADDRESS: "127.0.0.1:10011",
                CARTESI_LOG_COLOR: "false",
                CARTESI_LOG_LEVEL: "info",
                CARTESI_NODE_TELEMETRY_ADDRESS: "127.0.0.1:10000",
                CARTESI_PRT_AUTH_MNEMONIC: DEVNET_MNEMONIC,
                CARTESI_SNAPSHOTS_DIR: "/app/.cartesi",
            });
        });

        it("should configure the PRT factory only with prt", () => {
            expect(nodeEnvironment(options)).not.toHaveProperty(
                "CARTESI_CONTRACTS_DAVE_APP_FACTORY_ADDRESS",
            );
            expect(
                nodeEnvironment({ ...options, prt: true })
                    .CARTESI_CONTRACTS_DAVE_APP_FACTORY_ADDRESS,
            ).toBeDefined();
        });

        it("should run in reader mode without a PRT signer when a sling node claims", () => {
            const env = nodeEnvironment({
                ...options,
                cartesiEnvironmentVariables: {
                    CARTESI_PRT_AUTH_KIND: "private_key",
                    CARTESI_PRT_AUTH_PRIVATE_KEY: "0xkey",
                },
                claimSubmission: false,
            });
            expect(env.CARTESI_FEATURE_CLAIM_SUBMISSION_ENABLED).toBe("false");
            expect(env).not.toHaveProperty("CARTESI_PRT_AUTH_MNEMONIC");
            expect(env).not.toHaveProperty("CARTESI_PRT_AUTH_KIND");
            expect(env).not.toHaveProperty("CARTESI_PRT_AUTH_PRIVATE_KEY");
        });

        it("should let the allowed host variables override the defaults, as they are", () => {
            const env = nodeEnvironment({
                ...options,
                cartesiEnvironmentVariables: {
                    CARTESI_AUTH_MNEMONIC: "a $dollar mnemonic",
                    CARTESI_LOG_LEVEL: "debug",
                    CARTESI_FEATURE_INSPECT_ENABLED: "false",
                },
            });
            expect(env.CARTESI_AUTH_MNEMONIC).toBe("a $dollar mnemonic");
            expect(env.CARTESI_LOG_LEVEL).toBe("debug");
            expect(env).not.toHaveProperty("CARTESI_FEATURE_INSPECT_ENABLED");
        });

        it("should point the node at the key files the host names, from the project", () => {
            const env = nodeEnvironment({
                ...options,
                cartesiEnvironmentVariables: {
                    CARTESI_AUTH_PRIVATE_KEY_FILE: "keys/claimer.key",
                    CARTESI_PRT_AUTH_PRIVATE_KEY_FILE: "/secrets/prt.key",
                },
            });
            expect(env.CARTESI_AUTH_PRIVATE_KEY_FILE).toBe(
                "/app/keys/claimer.key",
            );
            expect(env.CARTESI_PRT_AUTH_PRIVATE_KEY_FILE).toBe(
                "/secrets/prt.key",
            );
        });

        // the node shares the network of the host, so it can't take its own
        it("should keep the listen addresses of the environment", () => {
            const env = nodeEnvironment({
                ...options,
                cartesiEnvironmentVariables: {
                    CARTESI_DATABASE_CONNECTION: "postgres://mine",
                },
            });
            expect(env.CARTESI_JSONRPC_API_ADDRESS).toBe("127.0.0.1:10011");
            // the database is the user's to choose, as it was
            expect(env.CARTESI_DATABASE_CONNECTION).toBe("postgres://mine");
        });
    });
});
