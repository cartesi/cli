import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { execa } from "execa";
import getPort, { portNumbers } from "get-port";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { toHex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { DEVNET_MNEMONIC } from "../../src/compose/node.js";
import { execNodeCommand } from "../../src/exec/node-container.js";
import {
    startEnvironment,
    stopEnvironment,
    waitHealthyEnvironment,
} from "../../src/exec/rollups.js";
import { TEST_RUNTIME_VERSION } from "./config.js";

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

    beforeAll(async () => {
        originalCwd = process.cwd();
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "node-startup-"));
        // compose files are written relative to the working directory
        process.chdir(directory);
        port = await getPort({ port: portNumbers(16751, 16761) });
    });

    afterAll(async () => {
        try {
            await stopEnvironment({ projectName });
            await stopEnvironment({ projectName: keysProjectName });
        } finally {
            process.chdir(originalCwd);
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });

    it("should reach a healthy node without prt", async () => {
        await startEnvironment({
            blockTime: 1,
            defaultBlock: "latest",
            detach: true,
            dryRun: false,
            port,
            projectName,
            prt: false,
            runtimeVersion: TEST_RUNTIME_VERSION,
            services: [],
            verbose: false,
        });

        // throws when any base service fails to become healthy
        await waitHealthyEnvironment({ port, projectName, services: [] });

        const { stdout } = await execa("docker", [
            "compose",
            "--project-name",
            projectName,
            "logs",
            "rollups_node",
        ]);

        // the node logs the identity it derived from the PRT mnemonic, which
        // proves the signer was used and not merely that the node booted
        expect(stdout).toContain("PRT submitter identity");
    }, 300_000);

    // the node runs as uid 102 and a key file is usually its owner's alone, so
    // the CLI hands the node a copy it owns; a PRT identity of the key file's
    // account, not the mnemonic's account 0, proves the node read it
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

        Object.assign(process.env, keyVars);
        try {
            await startEnvironment({
                blockTime: 1,
                defaultBlock: "latest",
                detach: true,
                dryRun: false,
                port: keysPort,
                projectName: keysProjectName,
                prt: false,
                runtimeVersion: TEST_RUNTIME_VERSION,
                services: [],
                verbose: false,
            });
        } finally {
            for (const name of Object.keys(keyVars)) {
                delete process.env[name];
            }
        }

        await waitHealthyEnvironment({
            port: keysPort,
            projectName: keysProjectName,
            services: [],
        });

        const { stdout } = await execa("docker", [
            "compose",
            "--project-name",
            keysProjectName,
            "logs",
            "rollups_node",
        ]);

        expect(stdout).toMatch(
            new RegExp(`PRT submitter identity.*${prt.address}`, "i"),
        );

        // the copy is what makes an owner-only file readable: owned by the
        // node's user, read-only, and the host file is left as it was
        const stat = (file: string) =>
            execNodeCommand({
                command: ["stat", "-c", "%U:%G %a", file],
                projectName: keysProjectName,
            });
        expect(await stat("/run/secrets/cartesi_auth_private_key_file")).toBe(
            "cartesi:cartesi 400",
        );
        expect(
            await stat("/run/secrets/cartesi_prt_auth_private_key_file"),
        ).toBe("cartesi:cartesi 400");

        // the init service mounts the host files read-only and copies them,
        // so their owner and mode don't change
        for (const { file } of [claimer, prt]) {
            const { uid, mode } = fs.statSync(file);
            expect(uid).toBe(process.getuid?.() ?? uid);
            expect(mode & 0o777).toBe(0o600);
        }
    }, 300_000);
});
