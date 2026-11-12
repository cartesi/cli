import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { execa, type ResultPromise } from "execa";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import type { Address } from "viem";
import { erc20PortalAddress, testUsdcAddress } from "../../../src/contracts";
import {
    getDaveConsensus,
    getLastAcceptedEpoch,
} from "../../../src/exec/rollups";
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
 * Covers `cartesi run --prt` with a sling claimer from [prt.nodes]: the
 * rollups-node runs in reader mode with no PRT signer, the sling claimer joins
 * the tournament, stages and accepts the result, and the sling sentry's claim
 * lets it do so without waiting out the staging period.
 */

const EPOCH_LENGTH = 10;

// long enough that acceptance within the test can only come from the sentry
const CLAIM_STAGING_PERIOD = 1_000_000;

// a lone claim wins its root tournament by timeout after about 700 blocks on
// the devnet clock
const MAX_BLOCKS = 4_000;
const BLOCKS_PER_STEP = 25;

const fixture = path.join(__dirname, "fixtures", "accounts-withdrawal");
const projectName = `prt-claimer-${process.pid}`;

const services = ["prt-node-blue", "prt-node-green"];

const compose = (...args: string[]) =>
    execa("docker", ["compose", "-p", projectName, ...args], {
        all: true,
        reject: false,
    });

const logsOf = async (service: string) =>
    (await compose("logs", "--no-log-prefix", service)).all ?? "";

/**
 * Mines in steps until `done` holds or the budget is spent, letting the nodes
 * see the blocks between steps.
 * @returns the blocks mined; the caller checks `done` held
 */
const mineUntil = async (
    anvil: AnvilClient,
    done: () => Promise<boolean>,
    maxBlocks = MAX_BLOCKS,
): Promise<number> => {
    let mined = 0;
    while (mined < maxBlocks) {
        await anvil.mine({ blocks: BLOCKS_PER_STEP });
        mined += BLOCKS_PER_STEP;
        if (await done()) {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return mined;
};

describe("prt with a sling claimer", () => {
    let appDir: string;
    let cleanup: () => void;
    let run: ResultPromise | undefined;
    let application: Address;
    let output: () => string;
    let anvil: AnvilClient;

    beforeAll(async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prt-claimer-"));
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

[prt.nodes.blue]
type = "sling"
role = "claimer"

[prt.nodes.green]
type = "sling"
role = "sentry"
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

        // the PRT nodes start after the deploy, which is what startApplication waits for
        console.log("! Waiting for the PRT nodes to start...");
        await waitFor(async () => {
            if (!output().includes("(devnet account 21, funded by the CLI)")) {
                throw new Error("PRT nodes not started yet");
            }
        });
        console.log("✓ PRT nodes started");
    }, TIMEOUT);

    afterAll(() => stopApplication({ cleanup, projectName, run }), TIMEOUT);

    it(
        "should appoint only the sentry on the consensus",
        async () => {
            const consensus = await getDaveConsensus({
                application,
                projectName,
            });

            expect(consensus.claimStagingPeriod).toBe(CLAIM_STAGING_PERIOD);
            expect(consensus.sentries).toEqual([
                { id: 1, address: devnetAccount(21) },
            ]);
        },
        TIMEOUT,
    );

    // the node follows the tournaments and records settled epochs, with no
    // PRT signer: the identity line of a submitting node never shows
    it(
        "should run the rollups-node in reader mode, with no PRT signer",
        async () => {
            const { stdout } = await execa("docker", [
                "compose",
                "-p",
                projectName,
                "exec",
                "-T",
                "rollups_node",
                "sh",
                "-c",
                'echo "$CARTESI_FEATURE_CLAIM_SUBMISSION_ENABLED:$CARTESI_PRT_AUTH_MNEMONIC"',
            ]);

            expect(stdout.trim()).toBe("false:");
            expect(await logsOf("rollups_node")).not.toContain(
                "PRT submitter identity",
            );
        },
        TIMEOUT,
    );

    it("should print the claimer first, then the sentry", () => {
        const printed = output();
        const claimer = printed.indexOf(
            `claimer blue ${devnetAccount(20)} (devnet account 20, funded by the CLI)`,
        );
        const sentry = printed.indexOf(
            `sentry 1 green ${devnetAccount(21)} (devnet account 21, funded by the CLI)`,
        );

        expect(claimer).toBeGreaterThan(
            printed.indexOf("contract deployed at"),
        );
        expect(sentry).toBeGreaterThan(claimer);
    });

    // the sling node reads its role from the consensus: a signer in no slot
    // disputes and settles, a signer in a slot also casts sentry claims
    it(
        "should log the claimer as no sentry, and the sentry with its slot",
        async () => {
            await waitFor(async () => {
                const [claimer, sentry] = await Promise.all(
                    services.map(logsOf),
                );
                if (!claimer.includes("is not a sentry of consensus")) {
                    throw new Error("the claimer hasn't logged its role yet");
                }
                if (!sentry.includes("is sentry 1 of consensus")) {
                    throw new Error("the sentry hasn't logged its role yet");
                }
            });
        },
        TIMEOUT,
    );

    // only the sling claimer can stage and accept here, and only the sentry's
    // claim lets it accept inside the staging period
    it(
        "should accept a claim inside the staging period, with the node reading",
        async () => {
            await deposit(anvil, application, devnetAccount(2), 1000n);
            const start = await anvil.getBlockNumber();

            let accepted: Awaited<ReturnType<typeof getLastAcceptedEpoch>>;
            const mined = await mineUntil(anvil, async () => {
                accepted = await getLastAcceptedEpoch({
                    application,
                    projectName,
                });
                return accepted !== undefined;
            });
            console.log(
                `! Accepted epoch ${accepted?.index} after ${mined} mined blocks, from block ${start}`,
            );

            expect(accepted, await logsOf("prt-node-blue")).toBeDefined();
            expect(accepted?.index).toBe(0n);
            expect(mined).toBeLessThan(CLAIM_STAGING_PERIOD);
            expect(await logsOf("rollups_node")).not.toContain(
                "PRT submitter identity",
            );
        },
        TIMEOUT,
    );

    it("should show the node, the claimer and the sentry in cartesi logs", async () => {
        const { all, exitCode } = await runCli({ appDir, projectName }, [
            "logs",
            "--tail",
            "5",
        ]);

        expect(exitCode).toBe(0);
        expect(all).toContain("rollups_node-1");
        expect(all).toContain("prt-node-blue-1");
        expect(all).toContain("prt-node-green-1");
    });
});
