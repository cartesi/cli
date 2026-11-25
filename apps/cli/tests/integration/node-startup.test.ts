import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import getPort, { portNumbers } from "get-port";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { toHex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import {
    type Environment,
    startEnvironment,
} from "../../src/host/environment.js";
import { DEVNET_MNEMONIC } from "../../src/host/node.js";

// The node starts its PRT service on every run and refuses to boot without a
// signer, so a healthy environment is the regression test for the CLI always
// setting CARTESI_PRT_AUTH_MNEMONIC, not only under --prt. No machine snapshot
// is needed: the node serves /livez before any application is deployed.
describe("rollups node startup", () => {
    const projectName = `cli-node-startup-${process.pid}`;
    const keysProjectName = `cli-node-startup-keys-${process.pid}`;
    let port: number;
    let directory: string;
    let originalCwd: string;
    const environments: Environment[] = [];

    /** The node's log, read before the environment stops and removes it. */
    const nodeLog = (environment: Environment) => {
        const node = environment.state.processes.find(
            ({ name }) => name === "rollups_node",
        );
        return fs.readFileSync(node?.log ?? "", "utf-8");
    };

    beforeAll(async () => {
        originalCwd = process.cwd();
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "node-startup-"));
        // the environment reads the machine snapshot of the working directory
        process.chdir(directory);
        port = await getPort({ port: portNumbers(16751, 16761) });
    });

    afterAll(async () => {
        try {
            await Promise.all(environments.map((e) => e.stop()));
        } finally {
            process.chdir(originalCwd);
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });

    it("should reach a healthy node without prt", async () => {
        // throws when any base service fails to become healthy
        const environment = await startEnvironment({
            blockTime: 1,
            defaultBlock: "latest",
            port,
            projectName,
            prt: false,
            renderer: "silent",
            services: [],
            verbose: false,
        });
        environments.push(environment);
        const stdout = nodeLog(environment);

        // the node logs the identity it derived from the PRT mnemonic, which
        // proves the signer was used and not merely that the node booted
        expect(stdout).toContain("PRT submitter identity");
    }, 300_000);

    // the node runs as the user, so it reads a key file that is the user's
    // alone, from where it is; a PRT identity of the key file's account, not
    // the mnemonic's account 0, proves the node read it
    it("should reach a healthy node with owner-only key files", async () => {
        const writeKey = (name: string, addressIndex: number) => {
            const account = mnemonicToAccount(DEVNET_MNEMONIC, {
                addressIndex,
            });
            const privateKey = account.getHdKey().privateKey;
            if (!privateKey) {
                throw new Error(`no private key for account ${addressIndex}`);
            }
            const file = path.join(directory, name);
            fs.writeFileSync(file, `${toHex(privateKey)}\n`, { mode: 0o600 });
            return { address: account.address, file };
        };
        const claimer = writeKey("claimer.key", 0);
        const prt = writeKey("prt.key", 6);
        const keyVars = {
            CARTESI_AUTH_KIND: "private_key_file",
            CARTESI_AUTH_PRIVATE_KEY_FILE: claimer.file,
            CARTESI_PRT_AUTH_KIND: "private_key_file",
            CARTESI_PRT_AUTH_PRIVATE_KEY_FILE: prt.file,
        };
        const keysPort = await getPort({ port: portNumbers(16751, 16761) });

        const environment = await startEnvironment({
            blockTime: 1,
            cartesiEnvironmentVariables: keyVars,
            defaultBlock: "latest",
            port: keysPort,
            projectName: keysProjectName,
            prt: false,
            renderer: "silent",
            services: [],
            verbose: false,
        });
        environments.push(environment);
        const stdout = nodeLog(environment);

        expect(stdout).toMatch(
            new RegExp(`PRT submitter identity.*${prt.address}`, "i"),
        );

        // the host files are only read, their owner and mode don't change
        for (const { file } of [claimer, prt]) {
            const { uid, mode } = fs.statSync(file);
            expect(uid).toBe(process.getuid?.() ?? uid);
            expect(mode & 0o777).toBe(0o600);
        }
    }, 300_000);
});
