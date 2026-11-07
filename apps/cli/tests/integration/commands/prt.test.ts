import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { execa, type ResultPromise } from "execa";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { type Address, parseEther } from "viem";
import { erc20PortalAddress, testUsdcAddress } from "../../../src/contracts";
import {
    getDaveConsensus,
    getLastAcceptedEpoch,
} from "../../../src/exec/rollups";
import { SENTRY_FUNDING } from "../../../src/sentries";
import { TEST_SDK } from "../config";
import {
    type AnvilClient,
    buildApplication,
    createAnvilClient,
    deposit,
    devnetAccount,
    runCli,
    startApplication,
    stopApplication,
    TIMEOUT,
    waitFor,
} from "../devnet";

/**
 * Covers `cartesi run --prt` with sentries from [prt]: the application is
 * deployed on a DaveConsensus with the sentries and the manager the config
 * names, in order; the CLI funds the pool sentries and runs a sling node for
 * each; and a claim they agree with is accepted without waiting out the
 * staging period.
 */

const EPOCH_LENGTH = 10;

// long enough that acceptance within the test can only come from the sentries
const CLAIM_STAGING_PERIOD = 1_000_000;

// a lone claim wins its root tournament by timeout after about 700 blocks on
// the devnet clock; two epochs fit well within this
const MAX_BLOCKS = 4_000;
const BLOCKS_PER_STEP = 25;

const fixture = path.join(__dirname, "fixtures", "accounts-withdrawal");
const projectName = `prt-${process.pid}`;

const sentryManager = devnetAccount(5);
const sentryServices = ["sentry-1", "sentry-2"];

const sentryLogs = async () => {
    const { all } = await execa(
        "docker",
        [
            "compose",
            "-p",
            projectName,
            "logs",
            "--tail",
            "40",
            ...sentryServices,
        ],
        { all: true, reject: false },
    );
    return all;
};

describe("prt", () => {
    let appDir: string;
    let cleanup: () => void;
    let run: ResultPromise | undefined;
    let application: Address;
    let output: () => string;
    let anvil: AnvilClient;

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
        anvil = await createAnvilClient(projectName);

        // the sentries start after the deploy, which is what startApplication waits for
        console.log("! Waiting for the sentries to start...");
        await waitFor(async () => {
            if (!output().includes("(devnet account 21, funded by the CLI)")) {
                throw new Error("sentries not started yet");
            }
        });
        console.log("✓ Sentries started");
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

    it(
        "should run a sling node for each sentry, on a funded pool account",
        async () => {
            // the sentries are up only once the application is deployed
            const { stdout } = await execa("docker", [
                "compose",
                "-p",
                projectName,
                "ps",
                "--services",
                "--status",
                "running",
            ]);
            expect(stdout.split("\n")).toEqual(
                expect.arrayContaining(sentryServices),
            );

            // set by the CLI, less the gas the sentries spent since
            for (const index of [20, 21]) {
                const balance = await anvil.getBalance({
                    address: devnetAccount(index),
                });
                expect(balance).toBeGreaterThan(
                    SENTRY_FUNDING - parseEther("1"),
                );
                expect(balance).toBeLessThanOrEqual(SENTRY_FUNDING);
            }
        },
        TIMEOUT,
    );

    // printed once the sentries run, after the deploy; the check mark before
    // each line is the terminal's, so the lines are matched without it
    it("should print the manager and each sentry with its devnet account", () => {
        const printed = output();
        const deployed = printed.indexOf("contract deployed at");

        expect(deployed).toBeGreaterThan(-1);
        expect(
            printed.indexOf(`sentry manager ${sentryManager}`),
        ).toBeGreaterThan(deployed);
        expect(printed).toContain(
            `sentry 1 ${devnetAccount(20)} (devnet account 20, funded by the CLI)`,
        );
        expect(printed).toContain(
            `sentry 2 ${devnetAccount(21)} (devnet account 21, funded by the CLI)`,
        );
    });

    // the shell's View logs runs `cartesi logs --follow`, so the sentries
    // must show there, next to the node
    it("should show the node and the sentries in cartesi logs", async () => {
        const { all, exitCode } = await runCli({ appDir, projectName }, [
            "logs",
            "--tail",
            "5",
        ]);

        expect(exitCode).toBe(0);
        expect(all).toContain("rollups_node-1");
        expect(all).toContain("sentry-1-1");
        expect(all).toContain("sentry-2-1");
    });

    it("should show one service named, without a prefix", async () => {
        const { all, exitCode } = await runCli({ appDir, projectName }, [
            "logs",
            "--tail",
            "5",
            "sentry-1",
        ]);

        expect(exitCode).toBe(0);
        expect(all?.trim().length).toBeGreaterThan(0);
        expect(all).not.toContain("sentry-1-1");
    });

    it("should reject a service the environment doesn't have", async () => {
        const { all, exitCode } = await runCli({ appDir, projectName }, [
            "logs",
            "sentry-3",
        ]);

        expect(exitCode).not.toBe(0);
        expect(all).toContain("service sentry-3 not found");
    });

    // with the staging period out of reach, the node accepts a staged claim
    // only when every sentry claimed the same result
    it(
        "should accept a claim the sentries agree with, within the staging period",
        async () => {
            await deposit(anvil, application, devnetAccount(2), 1000n);
            const start = await anvil.getBlockNumber();

            let accepted: Awaited<ReturnType<typeof getLastAcceptedEpoch>>;
            let mined = 0;
            while (mined < MAX_BLOCKS) {
                await anvil.mine({ blocks: BLOCKS_PER_STEP });
                mined += BLOCKS_PER_STEP;
                accepted = await getLastAcceptedEpoch({
                    application,
                    projectName,
                });
                if (accepted) {
                    break;
                }
                // let the node and the sentries see the blocks
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            const consensus = await getDaveConsensus({
                application,
                projectName,
            });
            console.log(
                `! Accepted epoch ${accepted?.index} after ${mined} mined blocks, from block ${start}; all sentries agree: ${consensus.allSentriesAgree}`,
            );

            expect(accepted, await sentryLogs()).toBeDefined();
            expect(mined).toBeLessThan(CLAIM_STAGING_PERIOD);
        },
        TIMEOUT,
    );
});
