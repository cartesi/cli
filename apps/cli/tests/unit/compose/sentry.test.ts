import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Address } from "viem";
import { generatePrivateKey } from "viem/accounts";
import buildSentries, {
    isSentryService,
    sentryServiceName,
} from "../../../src/compose/sentry";
import { resolveSentries } from "../../../src/sentries";
import { getDevnetAccount } from "../../../src/wallet";

/**
 * The compose services of the sentries the CLI runs: a sling node per
 * `type = "sling"` entry, with its key in the environment for a devnet
 * account, or copied by an init service for a key file.
 */
describe("Compose sentry services", () => {
    const application: Address = "0x1111111111111111111111111111111111111111";
    const ownKey = generatePrivateKey();
    let keyFile: string;

    beforeAll(() => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sentry-"));
        keyFile = path.join(dir, "sentry.key");
        fs.writeFileSync(keyFile, ownKey);
    });

    afterAll(() => fs.rmSync(path.dirname(keyFile), { recursive: true }));

    const compose = (blockTime = 2) =>
        buildSentries({
            application,
            blockTime,
            imageTag: "devel",
            sentries: resolveSentries({
                sentries: [
                    { type: "sling" },
                    { type: "sling", label: "mine", privateKeyFile: keyFile },
                    { address: "0x5555555555555555555555555555555555555555" },
                ],
            }).sentries,
        });

    it("should name the services after the labels", () => {
        expect(sentryServiceName("mine")).toBe("sentry-mine");
    });

    it("should compose one file per sentry the CLI runs, none for an appointed one", () => {
        const files = compose();

        expect(files.map((file) => Object.keys(file.services ?? {}))).toEqual([
            ["sentry-1"],
            ["sentry-mine", "secret-init-sentry-mine"],
        ]);
    });

    it("should run a sling node on the pool account's key, polling every block", () => {
        const [file] = compose(2);
        const service = file.services?.["sentry-1"];

        expect(service?.image).toBe("cartesi/rollups-runtime:devel");
        expect(service?.command).toEqual(["cartesi-sling-node", "pk"]);
        expect(service?.depends_on).toEqual({
            anvil: { condition: "service_healthy" },
        });
        expect(service?.environment).toEqual({
            CARTESI_SLING_APP_ADDRESS: application,
            CARTESI_SLING_AUTH_PRIVATE_KEY: getDevnetAccount(20).privateKey,
            CARTESI_SLING_BLOCKCHAIN_HTTP_ENDPOINT: "http://anvil:8545",
            CARTESI_SLING_BLOCKCHAIN_ID: "31337",
            CARTESI_SLING_DATA_DIR: "/var/lib/cartesi-rollups-node/snapshots",
            CARTESI_SLING_POLLING_INTERVAL: "2",
            CARTESI_SLING_TEMPLATE_PATH:
                "/var/lib/cartesi-rollups-node/template/image",
        });
        // the machine the node deploys, read-only
        expect(service?.volumes).toEqual([
            "./.cartesi:/var/lib/cartesi-rollups-node/template:ro",
        ]);
        expect(file.volumes).toBeUndefined();
    });

    it("should poll at least every second", () => {
        const [file] = compose(0.5);

        expect(file.services?.["sentry-1"]?.environment).toMatchObject({
            CARTESI_SLING_POLLING_INTERVAL: "1",
        });
    });

    it("should copy a key file for the sentry and point it at the copy", () => {
        const [, file] = compose();
        const service = file.services?.["sentry-mine"];
        const init = file.services?.["secret-init-sentry-mine"];

        expect(service?.environment).toMatchObject({
            CARTESI_SLING_AUTH_PRIVATE_KEY_FILE: "/run/secrets/sentry-mine",
        });
        expect(service?.environment).not.toHaveProperty(
            "CARTESI_SLING_AUTH_PRIVATE_KEY",
        );
        expect(service?.depends_on).toEqual({
            anvil: { condition: "service_healthy" },
            "secret-init-sentry-mine": {
                condition: "service_completed_successfully",
            },
        });
        expect(service?.volumes).toEqual([
            "./.cartesi:/var/lib/cartesi-rollups-node/template:ro",
            "sentry_mine_secrets:/run/secrets:ro",
        ]);
        expect(init?.image).toBe("cartesi/rollups-runtime:devel");
        expect(init?.user).toBe("root");
        expect(init?.command).toEqual([
            `find /dst -mindepth 1 -delete\ninstall -o cartesi -g cartesi -m 0400 /src/sentry-mine /dst/sentry-mine`,
        ]);
        expect(init?.volumes).toEqual([
            {
                type: "bind",
                source: keyFile,
                target: "/src/sentry-mine",
                read_only: true,
                bind: { create_host_path: false },
            },
            "sentry_mine_secrets:/dst",
        ]);
        expect(file.volumes).toEqual({ sentry_mine_secrets: {} });
    });

    // the key never leaves the file
    it("should not put a key file's key anywhere in the compose file", () => {
        const [, file] = compose();

        expect(JSON.stringify(file)).not.toContain(ownKey.slice(2));
    });

    // `cartesi logs` tells the sentries from the rest of the environment by
    // name; a label holding `-` must not make the installer of another sentry
    it("should tell a sentry's service from its key file installer", () => {
        const [, file] = compose();

        expect(
            Object.keys(file.services ?? {}).filter(isSentryService),
        ).toEqual(["sentry-mine"]);
        expect(isSentryService(sentryServiceName("x-secret-init"))).toBe(true);
        expect(isSentryService("secret-init-sentry-x-secret-init")).toBe(false);
        expect(isSentryService("rollups_node")).toBe(false);
    });
});
