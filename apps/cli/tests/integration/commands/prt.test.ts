import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { ResultPromise } from "execa";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import type { Address } from "viem";
import { erc20PortalAddress, testUsdcAddress } from "../../../src/contracts";
import { getDaveConsensus } from "../../../src/exec/rollups";
import { TEST_SDK } from "../config";
import {
    buildApplication,
    devnetAccount,
    startApplication,
    stopApplication,
    TIMEOUT,
} from "../devnet";

/**
 * Covers `cartesi run --prt` with sentries from [prt]: the application is
 * deployed on a DaveConsensus with the sentries and the manager the config
 * names, in order.
 */

const EPOCH_LENGTH = 10;

// long enough that acceptance within the test can only come from the sentries
const CLAIM_STAGING_PERIOD = 1_000_000;

const fixture = path.join(__dirname, "fixtures", "accounts-withdrawal");
const projectName = `prt-${process.pid}`;

const sentryManager = devnetAccount(5);

describe("prt", () => {
    let appDir: string;
    let cleanup: () => void;
    let run: ResultPromise | undefined;
    let application: Address;
    let output: () => string;

    beforeAll(async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prt-"));
        cleanup = () => fs.removeSync(dir);
        appDir = path.join(dir, "accounts-withdrawal");
        await fs.copy(fixture, appDir);
        await fs.writeFile(
            path.join(appDir, "cartesi.toml"),
            `sdk = "${TEST_SDK}"

[machine.env]
TRUSTED_ERC20_PORTAL = "${erc20PortalAddress}"
TRUSTED_ERC20_TOKEN = "${testUsdcAddress}"
ACCOUNTS_LABEL = "accounts"

[drives.accounts]
builder = "empty"
format = "raw"
size = "4MB"
mount = false
user = "dapp"
accounts_drive = true

[prt]
sentry_manager = "${sentryManager}"

[[prt.sentries]]
type = "sling"

[[prt.sentries]]
type = "sling"
`,
        );

        console.log("! Building the accounts-withdrawal application...");
        const build = await buildApplication(appDir);
        expect(build.exitCode, build.all).toBe(0);
        console.log("✓ Built the accounts-withdrawal application");

        ({ application, output, run } = await startApplication({
            appDir,
            epochLength: EPOCH_LENGTH,
            extraArgs: [
                "--prt",
                "--claim-staging-period",
                CLAIM_STAGING_PERIOD.toString(),
            ],
            projectName,
        }));
    }, TIMEOUT);

    afterAll(() => stopApplication({ cleanup, projectName, run }), TIMEOUT);

    it(
        "should appoint the sentries of [prt] on the consensus, in order",
        async () => {
            const consensus = await getDaveConsensus({
                application,
                projectName,
            });

            expect(consensus.sentryManager).toBe(sentryManager);
            expect(consensus.claimStagingPeriod).toBe(CLAIM_STAGING_PERIOD);
            expect(consensus.sentries).toEqual([
                { id: 1, address: devnetAccount(20) },
                { id: 2, address: devnetAccount(21) },
            ]);
        },
        TIMEOUT,
    );

    it("should print each sentry with its devnet account", () => {
        const printed = output();

        expect(printed).toContain(`sentry manager ${sentryManager}`);
        expect(printed).toContain(`sentry 1 ${devnetAccount(20)}`);
        expect(printed).toContain("(devnet account 20)");
        expect(printed).toContain(`sentry 2 ${devnetAccount(21)}`);
        expect(printed).toContain("(devnet account 21)");
    });
});
