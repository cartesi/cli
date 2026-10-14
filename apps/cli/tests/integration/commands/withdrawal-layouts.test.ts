import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { ResultPromise } from "execa";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { Address } from "viem";
import { erc20PortalAddress, testUsdcAddress } from "../../../src/contracts";
import { getNodeWithdrawalConfig } from "../../../src/exec/rollups";
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
    usdcBalance,
    waitForAcceptedEpoch,
} from "../devnet";
import { type Layout, layouts } from "./fixtures/accounts-withdrawal-layouts";

/**
 * Recovers the funds of applications whose accounts drive is laid out in each
 * supported way. The application looks its accounts drive up by label, and its
 * cartesi.toml only marks the accounts drive, so nothing about the layout is
 * known in advance: proving and withdrawing the balances is what shows the
 * derived layout matches where the machine placed the drive.
 */

const EPOCH_LENGTH = 720;

const fixture = path.join(__dirname, "fixtures", "accounts-withdrawal");

const alice = devnetAccount(2);
const bob = devnetAccount(3);
const amounts = { alice: 100n, bob: 50n };

/**
 * Writes the application with the layout, and builds it.
 */
const buildLayout = async (appDir: string, layout: Layout) => {
    await fs.copy(fixture, appDir);
    if (layout.image) {
        const { at, data, filename, size } = layout.image;
        const image = Buffer.alloc(size);
        data.copy(image, at);
        await fs.writeFile(path.join(appDir, filename), image);
    }
    await fs.writeFile(
        path.join(appDir, "cartesi.toml"),
        `sdk = "${TEST_SDK}"
${layout.config}
[machine.env]
TRUSTED_ERC20_PORTAL = "${erc20PortalAddress}"
TRUSTED_ERC20_TOKEN = "${testUsdcAddress}"
ACCOUNTS_LABEL = "${layout.label}"
${layout.accountsSize ? `ACCOUNTS_SIZE = "${layout.accountsSize}"` : ""}
`,
    );
    return buildApplication(appDir);
};

layouts.forEach((layout, index) => {
    const describeLayout = layout.skip ? describe.skip : describe;

    describeLayout(`emergency withdrawal from ${layout.name}`, () => {
        const projectName = `layouts-${index}-${process.pid}`;
        let appDir: string;
        let cleanup: () => void;
        let run: ResultPromise | undefined;
        let application: Address;
        let anvil: AnvilClient;
        let printed: Record<string, string | number>;

        const cli = (args: string[]) => runCli({ appDir, projectName }, args);

        beforeAll(async () => {
            const dir = fs.mkdtempSync(
                path.join(os.tmpdir(), "withdrawal-layout-"),
            );
            cleanup = () => fs.removeSync(dir);
            appDir = path.join(dir, "accounts-withdrawal");

            console.log(`! Building an application with ${layout.name}...`);
            const build = await buildLayout(appDir, layout);
            expect(build.exitCode, build.all).toBe(0);
            const output = stripVTControlCharacters(build.all ?? "");
            expect(output).toContain(
                `accounts drive  ${layout.label} (${layout.device.startsWith("/dev/uio") ? "nvram" : "flash drive"}) → ${layout.device}`,
            );
            const withdrawalConfig = output.match(
                /--withdrawal-config '(\{.*\})'/,
            );
            expect(withdrawalConfig, output).not.toBeNull();
            printed = JSON.parse(withdrawalConfig?.[1] ?? "{}");
            console.log(`✓ Built with ${withdrawalConfig?.[1]}`);

            ({ application, run } = await startApplication({
                appDir,
                epochLength: EPOCH_LENGTH,
                projectName,
            }));
            anvil = await createAnvilClient(projectName);
        }, TIMEOUT);

        afterAll(() => stopApplication({ cleanup, projectName, run }), TIMEOUT);

        it(
            "should deploy the withdrawal config printed by the build",
            async () => {
                const config = await getNodeWithdrawalConfig({
                    application,
                    projectName,
                });
                expect(config).toEqual({
                    accountsDriveStartIndex: BigInt(
                        printed.accounts_drive_start_index,
                    ),
                    guardian: printed.guardian as Address,
                    log2LeavesPerAccount: BigInt(
                        printed.log2_leaves_per_account,
                    ),
                    log2MaxNumOfAccounts: BigInt(
                        printed.log2_max_num_of_accounts,
                    ),
                    withdrawalOutputBuilder:
                        printed.withdrawal_output_builder as Address,
                });
            },
            TIMEOUT,
        );

        it(
            "should withdraw the finalized balances after the foreclosure",
            async () => {
                await deposit(anvil, application, alice, amounts.alice);
                await deposit(anvil, application, bob, amounts.bob);

                // close the epoch and wait for its claim to be accepted
                await anvil.mine({ blocks: EPOCH_LENGTH });
                console.log("! Waiting for epoch 0 to be accepted...");
                await waitForAcceptedEpoch({ application, projectName });

                // the devnet guardian is in the mnemonic the node signs with
                const foreclose = await cli(["foreclose", "--yes"]);
                expect(foreclose.exitCode, foreclose.all).toBe(0);

                for (const [account, amount] of [
                    [alice, amounts.alice],
                    [bob, amounts.bob],
                ] as const) {
                    expect(await usdcBalance(anvil, account)).toBe(0n);
                    const withdraw = await cli([
                        "withdraw",
                        "--account",
                        account,
                        "--yes",
                    ]);
                    expect(withdraw.exitCode, withdraw.all).toBe(0);
                    expect(await usdcBalance(anvil, account)).toBe(amount);
                }
            },
            TIMEOUT,
        );
    });
});
