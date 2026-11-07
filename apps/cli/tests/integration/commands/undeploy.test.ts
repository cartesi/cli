import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { ResultPromise } from "execa";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { erc20PortalAddress, testUsdcAddress } from "../../../src/contracts";
import { type Address, numberToHex } from "viem";
import {
    deployApplication,
    getDeployments,
    removeApplication,
} from "../../../src/exec/rollups";
import { TEST_SDK } from "../config";
import {
    buildApplication,
    startApplication,
    stopApplication,
    TIMEOUT,
} from "../devnet";

/**
 * Covers the undeploy and the redeploy `cartesi run` does for a rebuilt
 * application. The shell that rebuilds needs a terminal, so both are called
 * the way the shell calls them, against an application of its own.
 */

const EPOCH_LENGTH = 720;

const fixture = path.join(__dirname, "fixtures", "accounts-withdrawal");
const projectName = `undeploy-${process.pid}`;

describe("undeploy", () => {
    let appDir: string;
    let cleanup: () => void;
    let run: ResultPromise | undefined;
    let consensus: Address | undefined;

    beforeAll(async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "undeploy-"));
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
`,
        );

        console.log("! Building the accounts-withdrawal application...");
        const build = await buildApplication(appDir);
        expect(build.exitCode, build.all).toBe(0);
        console.log("✓ Built the accounts-withdrawal application");

        ({ run } = await startApplication({
            appDir,
            epochLength: EPOCH_LENGTH,
            projectName,
        }));

        // read before any case removes the application
        const deployments = await getDeployments({ projectName });
        consensus = deployments.find(
            ({ name }) => name === projectName,
        )?.consensus;
    }, TIMEOUT);

    afterAll(() => stopApplication({ cleanup, projectName, run }), TIMEOUT);

    // the node refuses to remove an application unless the removal
    // acknowledges the work it abandons
    it(
        "should remove the deployed application",
        async () => {
            await removeApplication({
                application: projectName,
                force: true,
                projectName,
            });

            const deployments = await getDeployments({ projectName });
            expect(deployments.map(({ name }) => name)).not.toContain(
                projectName,
            );
        },
        TIMEOUT,
    );

    // the shell redeploys a rebuilt machine on the consensus of the first
    // deploy, which the node does through the application factory
    it(
        "should deploy an application on an existing consensus",
        async () => {
            expect(consensus).toBeDefined();
            const name = `${projectName}-redeploy`;

            const deployment = await deployApplication({
                claimStagingPeriod: 0,
                consensus,
                epochLength: EPOCH_LENGTH,
                name,
                projectName,
                salt: numberToHex(1, { size: 32 }),
                snapshotPath: "/var/lib/cartesi-rollups-node/snapshots/image",
            });

            expect(deployment.consensus).toBe(consensus as Address);
            const deployments = await getDeployments({ projectName });
            expect(deployments.map(({ name }) => name)).toContain(name);
        },
        TIMEOUT,
    );

    // a failed removal must reach the caller, or a rebuild would deploy over
    // an application that is still registered
    it(
        "should fail to remove an application that was never deployed",
        async () => {
            await expect(
                removeApplication({
                    application: "never-deployed",
                    force: true,
                    projectName,
                }),
            ).rejects.toThrow();
        },
        TIMEOUT,
    );
});
