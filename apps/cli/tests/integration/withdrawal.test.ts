import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import getPort, { portNumbers } from "get-port";
import path from "node:path";
import { satisfies } from "semver";
import { createPublicClient, http, numberToHex } from "viem";
import { getApplicationConfig } from "../../src/base.js";
import { iApplicationAbi } from "../../src/contracts.js";
import { cartesiMachine } from "../../src/exec/index.js";
import {
    deployApplication,
    startEnvironment,
    stopEnvironment,
    waitHealthyEnvironment,
} from "../../src/exec/rollups.js";
import { bootMachine } from "../../src/machine.js";
import {
    DEVNET_GUARDIAN,
    DEVNET_WITHDRAWAL_OUTPUT_BUILDER,
    getWithdrawalConfig,
    readStoredMachineConfig,
    resolveAccountsDriveLayout,
} from "../../src/withdrawal.js";
import {
    createTemporaryCartesiApplication,
    ensureDockerImage,
    TEST_RUNTIME_VERSION,
    TEST_SDK,
} from "./config.js";

await ensureDockerImage(TEST_SDK);

// nvrams only exist from cartesi-machine 0.21.0, see machine/nvram.test.ts
const found = await cartesiMachine.version({
    image: TEST_SDK,
    forceDocker: true,
});

const supported =
    found !== null && satisfies(found.format(), cartesiMachine.requiredVersion);

// no [withdrawal] section: marking the drive is all it takes
const CONFIG = `[nvrams.state]
size = "4Ki"

[nvrams.accounts]
size = "4Mi"
accounts_drive = true
` as const;

describe.skipIf(!supported)(
    "when deploying an application with an accounts drive",
    () => {
        const projectName = `cli-withdrawal-${process.pid}`;
        let app: Awaited<ReturnType<typeof createTemporaryCartesiApplication>>;
        let port: number;

        beforeAll(
            async () => {
                // leaves the working directory at the app, where compose mounts .cartesi from
                app = await createTemporaryCartesiApplication({
                    config: CONFIG,
                });
                port = await getPort({ port: portNumbers(16751, 16761) });
            },
            { timeout: 60000 * 20 },
        );

        afterAll(async () => {
            try {
                await stopEnvironment({ projectName });
            } finally {
                app?.cleanup();
            }
        });

        it("should resolve the accounts drive from the built machine", () => {
            const config = getApplicationConfig(["cartesi.toml"]);
            const layout = resolveAccountsDriveLayout(
                config,
                readStoredMachineConfig(app.machineDir),
            );

            expect(layout).toMatchObject({
                kind: "nvram",
                label: "accounts",
                device: "/dev/uio1",
                length: 4194304n,
                log2Length: 22,
            });
            expect(layout?.start).toEqual(
                (layout?.startIndex ?? 0n) * 4194304n,
            );
        });

        it("should expose the accounts drive at the resolved device", async () => {
            const config = getApplicationConfig(["cartesi.toml"]);
            config.machine.entrypoint = "nvram accounts";

            const { stdout } = await bootMachine(
                config,
                undefined,
                {},
                // absolute, as without a local cartesi-machine it is mounted into docker
                { cwd: path.join(app.appDir, ".cartesi") },
            );
            expect(stdout as string).toContain("/dev/uio1");
        });

        it(
            "should deploy with the derived withdrawal configuration",
            async () => {
                const config = getApplicationConfig(["cartesi.toml"]);
                const withdrawalConfig = getWithdrawalConfig(
                    config,
                    app.machineDir,
                );

                expect(withdrawalConfig).toMatchObject({
                    guardian: DEVNET_GUARDIAN,
                    log2_leaves_per_account: 0,
                    log2_max_num_of_accounts: 17,
                    withdrawal_output_builder: DEVNET_WITHDRAWAL_OUTPUT_BUILDER,
                });

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
                await waitHealthyEnvironment({
                    port,
                    projectName,
                    services: [],
                });

                const deployment = await deployApplication({
                    claimStagingPeriod: 0,
                    epochLength: 720,
                    name: projectName,
                    projectName,
                    salt: numberToHex(0, { size: 32 }),
                    snapshotPath:
                        "/var/lib/cartesi-rollups-node/snapshots/image",
                    withdrawalConfig,
                });

                // the node passes the configuration on to the application contract
                const client = createPublicClient({
                    transport: http(`http://127.0.0.1:${port}/anvil`),
                });
                const onchain = await client.readContract({
                    address: deployment.address,
                    abi: iApplicationAbi,
                    functionName: "getWithdrawalConfig",
                });

                expect(onchain).toEqual({
                    guardian: DEVNET_GUARDIAN,
                    log2LeavesPerAccount: 0,
                    log2MaxNumOfAccounts: 17,
                    accountsDriveStartIndex: BigInt(
                        withdrawalConfig?.accounts_drive_start_index ?? 0,
                    ),
                    withdrawalOutputBuilder: DEVNET_WITHDRAWAL_OUTPUT_BUILDER,
                });
            },
            { timeout: 60000 * 5 },
        );
    },
);
