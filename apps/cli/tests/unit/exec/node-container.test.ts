import { describe, expect, it } from "bun:test";
import { execa } from "execa";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    getHostSigner,
    hostSignerEnv,
    NODE_SIGNER_SCRIPT,
    nodeExecOptions,
    parseNodeSigner,
    transactionArgs,
} from "../../../src/exec/node-container";

describe("transactionArgs", () => {
    it("should forward nothing by default", () => {
        expect(transactionArgs({})).toEqual([]);
    });

    it("should forward each option that is set", () => {
        expect(
            transactionArgs({
                json: true,
                wait: false,
                waitTimeout: "5m",
                yes: true,
            }),
        ).toEqual(["--yes", "--json", "--no-wait", "--wait-timeout", "5m"]);
    });

    it("should not forward --no-wait when waiting", () => {
        expect(transactionArgs({ wait: true })).toEqual([]);
    });
});

describe("nodeExecOptions", () => {
    const state = {
        dir: "/tmp/cartesi-0/dapp",
        nodeEnv: {
            CARTESI_AUTH_MNEMONIC_ACCOUNT_INDEX: "0",
            CARTESI_DATABASE_CONNECTION: "postgres://node",
        },
    };

    it("should run the command on the host, from the environment directory", () => {
        const options = nodeExecOptions({
            command: ["cartesi-rollups-cli", "app", "list"],
            state,
        });
        expect(options.file).toBe("cartesi-rollups-cli");
        expect(options.args).toEqual(["app", "list"]);
        expect(options.cwd).toBe(state.dir);
    });

    it("should run with the environment of the node", () => {
        const { env } = nodeExecOptions({ command: ["true"], state });
        expect(env.CARTESI_DATABASE_CONNECTION).toBe("postgres://node");
    });

    it("should leave the CARTESI_ variables of the host out", () => {
        const previous = process.env.CARTESI_LOG_LEVEL;
        process.env.CARTESI_LOG_LEVEL = "debug";
        try {
            const { env } = nodeExecOptions({ command: ["true"], state });
            expect(env.CARTESI_LOG_LEVEL).toBeUndefined();
            expect(env.PATH).toBe(process.env.PATH as string);
        } finally {
            if (previous === undefined) {
                delete process.env.CARTESI_LOG_LEVEL;
            } else {
                process.env.CARTESI_LOG_LEVEL = previous;
            }
        }
    });

    it("should let the variables given override the node's", () => {
        const { env } = nodeExecOptions({
            command: ["true"],
            env: { CARTESI_AUTH_KIND: "private_key" },
            state,
        });
        expect(env.CARTESI_AUTH_KIND).toBe("private_key");
    });

    it("should run the command in the working directory", () => {
        const { cwd } = nodeExecOptions({
            command: ["true"],
            state,
            workdir: "/tmp/work",
        });
        expect(cwd).toBe("/tmp/work");
    });

    it("should select the signer account index", () => {
        const { env } = nodeExecOptions({
            accountIndex: 3,
            command: ["true"],
            state,
        });
        expect(env.CARTESI_AUTH_MNEMONIC_ACCOUNT_INDEX).toBe("3");
    });
});

describe("parseNodeSigner", () => {
    it("should parse a mnemonic signer", () => {
        expect(parseNodeSigner("mnemonic\ntest test junk\n")).toEqual({
            kind: "mnemonic",
            mnemonic: "test test junk",
        });
    });

    it("should parse a mnemonic file signer as a mnemonic", () => {
        expect(parseNodeSigner("mnemonic_file\ntest test junk")).toEqual({
            kind: "mnemonic",
            mnemonic: "test test junk",
        });
    });

    it("should parse private key signers without their key", () => {
        expect(parseNodeSigner("private_key\n")).toEqual({
            kind: "private_key",
        });
        expect(parseNodeSigner("private_key_file\n")).toEqual({
            kind: "private_key",
        });
    });

    it("should reject a mnemonic signer without a mnemonic", () => {
        expect(() => parseNodeSigner("mnemonic\n")).toThrow("no mnemonic");
    });

    it("should reject unsupported signer kinds", () => {
        expect(() => parseNodeSigner("aws\n")).toThrow("aws");
        expect(() => parseNodeSigner("ledger\n")).toThrow("ledger");
    });
});

describe("NODE_SIGNER_SCRIPT", () => {
    const run = async (env: Record<string, string>) =>
        parseNodeSigner(
            (
                await execa("sh", ["-c", NODE_SIGNER_SCRIPT], {
                    env,
                    extendEnv: false,
                })
            ).stdout,
        );

    it("should default to an inline mnemonic", async () => {
        expect(await run({ CARTESI_AUTH_MNEMONIC: "a b c" })).toEqual({
            kind: "mnemonic",
            mnemonic: "a b c",
        });
    });

    it("should read the mnemonic file", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signer-"));
        const file = path.join(dir, "mnemonic");
        fs.writeFileSync(file, "x y z\n");
        try {
            expect(
                await run({
                    CARTESI_AUTH_KIND: "mnemonic_file",
                    CARTESI_AUTH_MNEMONIC_FILE: file,
                }),
            ).toEqual({ kind: "mnemonic", mnemonic: "x y z" });
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it("should never print a private key", async () => {
        const { stdout } = await execa("sh", ["-c", NODE_SIGNER_SCRIPT], {
            env: {
                CARTESI_AUTH_KIND: "private_key",
                CARTESI_AUTH_PRIVATE_KEY: "0xsecret",
            },
            extendEnv: false,
        });
        expect(stdout).not.toContain("0xsecret");
        expect(parseNodeSigner(stdout)).toEqual({ kind: "private_key" });
    });
});

// a well known anvil private key
const guardianKey =
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

describe("getHostSigner", () => {
    it("should return undefined when nothing is set", () => {
        expect(getHostSigner({})).toBeUndefined();
    });

    it("should infer the kind from the variable that is set", () => {
        expect(getHostSigner({ CARTESI_AUTH_MNEMONIC: "a b c" })).toEqual({
            kind: "mnemonic",
            mnemonic: "a b c",
        });
        expect(
            getHostSigner({ CARTESI_AUTH_PRIVATE_KEY: guardianKey }),
        ).toEqual({ kind: "private_key", privateKey: guardianKey });
    });

    it("should let CARTESI_AUTH_KIND choose when both are set", () => {
        const env = {
            CARTESI_AUTH_MNEMONIC: "a b c",
            CARTESI_AUTH_PRIVATE_KEY: guardianKey,
        };
        expect(() => getHostSigner(env)).toThrow("CARTESI_AUTH_KIND");
        expect(
            getHostSigner({ ...env, CARTESI_AUTH_KIND: "private_key" }),
        ).toEqual({ kind: "private_key", privateKey: guardianKey });
        expect(
            getHostSigner({ ...env, CARTESI_AUTH_KIND: "mnemonic" }),
        ).toEqual({ kind: "mnemonic", mnemonic: "a b c" });
    });

    it("should reject a kind without its variable", () => {
        expect(() => getHostSigner({ CARTESI_AUTH_KIND: "mnemonic" })).toThrow(
            "CARTESI_AUTH_MNEMONIC",
        );
        expect(() =>
            getHostSigner({ CARTESI_AUTH_KIND: "private_key" }),
        ).toThrow("CARTESI_AUTH_PRIVATE_KEY");
    });

    it("should reject a private key that isn't hex", () => {
        expect(() =>
            getHostSigner({ CARTESI_AUTH_PRIVATE_KEY: "not-a-key" }),
        ).toThrow("0x-prefixed");
    });

    it("should reject kinds not supported per command", () => {
        expect(() =>
            getHostSigner({ CARTESI_AUTH_KIND: "mnemonic_file" }),
        ).toThrow("mnemonic_file");
        expect(() => getHostSigner({ CARTESI_AUTH_KIND: "aws" })).toThrow(
            "aws",
        );
    });

    it("should build the environment for each signer kind", () => {
        expect(hostSignerEnv({ kind: "mnemonic", mnemonic: "a b c" })).toEqual({
            CARTESI_AUTH_KIND: "mnemonic",
            CARTESI_AUTH_MNEMONIC: "a b c",
        });
        expect(
            hostSignerEnv({ kind: "private_key", privateKey: guardianKey }),
        ).toEqual({
            CARTESI_AUTH_KIND: "private_key",
            CARTESI_AUTH_PRIVATE_KEY: guardianKey,
        });
    });
});
