import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Address } from "viem";
import { generatePrivateKey } from "viem/accounts";
import {
    isPrtNodeService,
    prtNodeProcesses,
    prtNodeServiceName,
} from "../../../src/host/prt-node";
import { resolvePrtNodes } from "../../../src/prt";
import { getDevnetAccount } from "../../../src/wallet";

/**
 * The processes of the PRT nodes the CLI runs: a sling node per
 * `type = "sling"` entry, with its key in the environment for a devnet
 * account, or read from the key file the host has.
 */
describe("PRT node processes", () => {
    const application: Address = "0x1111111111111111111111111111111111111111";
    let keyFile: string;

    beforeAll(() => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prt-node-"));
        keyFile = path.join(dir, "sentry.key");
        fs.writeFileSync(keyFile, generatePrivateKey());
    });

    afterAll(() => fs.rmSync(path.dirname(keyFile), { recursive: true }));

    const processes = (blockTime = 2) =>
        prtNodeProcesses({
            anvilUrl: "http://127.0.0.1:8545",
            application,
            blockTime,
            cwd: "/app",
            dir: "/tmp/cartesi-0/app",
            nodes: resolvePrtNodes({
                nodes: {
                    first: { type: "sling", sentry: true },
                    mine: {
                        type: "sling",
                        sentry: true,
                        privateKeyFile: keyFile,
                    },
                    theirs: {
                        sentry: true,
                        address: "0x5555555555555555555555555555555555555555",
                    },
                },
            }).nodes,
            templatePath: "/app/.cartesi/image",
        });

    it("should name the services after the labels", () => {
        expect(prtNodeServiceName("mine")).toBe("prt-node-mine");
        expect(isPrtNodeService("prt-node-mine")).toBe(true);
        expect(isPrtNodeService("rollups_node")).toBe(false);
    });

    it("should run one process per node the CLI runs, none for an appointed one", () => {
        expect(processes().map(({ name }) => name)).toEqual([
            "prt-node-first",
            "prt-node-mine",
        ]);
    });

    it("should run a sling node on the pool account's key, polling every block", () => {
        const [first] = processes(2);
        expect(first?.command).toBe("cartesi-sling-node");
        expect(first?.args).toEqual(["pk"]);
        expect(first?.env).toEqual({
            CARTESI_SLING_APP_ADDRESS: application,
            CARTESI_SLING_AUTH_PRIVATE_KEY: getDevnetAccount(20).privateKey,
            CARTESI_SLING_BLOCKCHAIN_HTTP_ENDPOINT: "http://127.0.0.1:8545",
            CARTESI_SLING_BLOCKCHAIN_ID: "31337",
            CARTESI_SLING_DATA_DIR: `/tmp/cartesi-0/app/prt/first/${application}`,
            CARTESI_SLING_POLLING_INTERVAL: "2",
            CARTESI_SLING_TEMPLATE_PATH: "/app/.cartesi/image",
        });
    });

    it("should poll at least every second", () => {
        const [first] = processes(0);
        expect(first?.env?.CARTESI_SLING_POLLING_INTERVAL).toBe("1");
    });

    it("should read a key file from the host, never its key", () => {
        const [, mine] = processes();
        expect(mine?.env?.CARTESI_SLING_AUTH_PRIVATE_KEY_FILE).toBe(keyFile);
        expect(mine?.env).not.toHaveProperty("CARTESI_SLING_AUTH_PRIVATE_KEY");
    });
});
