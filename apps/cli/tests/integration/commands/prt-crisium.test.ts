import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { execa, type ResultPromise } from "execa";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { type Address, isAddressEqual } from "viem";
import { erc20PortalAddress, testUsdcAddress } from "../../../src/contracts";
import { getLastAcceptedEpoch } from "../../../src/exec/rollups";
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
 * Covers `cartesi run --prt` with crisium, the Lua PRT player: the rollups-node
 * reads, a crisium validator stages the claim and settles the epoch, and a
 * crisium sentinel follows it with no account. The checks are the CLI's wiring
 * (the data each init service prepares, the containers, `cartesi logs`) and one
 * fact of the chain, the accepted epoch, which holds only while the emulator,
 * the Solidity step, the dave artifacts and the player in the image agree.
 */

const EPOCH_LENGTH = 10;

// short, so the staged result is accepted soon after the tournament settles
const CLAIM_STAGING_PERIOD = 10;

// a lone claim wins its root tournament by timeout after about 700 blocks on
// the devnet clock
const MAX_BLOCKS = 4_000;
const BLOCKS_PER_STEP = 25;

const fixture = path.join(__dirname, "fixtures", "accounts-withdrawal");
const projectName = `prt-crisium-${process.pid}`;

const DATA_DIR = "/var/lib/cartesi-rollups-node/snapshots";

const services = ["prt-node-red", "prt-node-watch"];

// the sentinel's anomaly handler, in the project: it records that the player
// loaded it, then each anomaly, in the node's own data directory. Only the
// wiring is checked, since an anomaly is the players' behaviour, not the CLI's
const ANOMALY_HANDLER = "prt/alerts.lua";
const ANOMALIES_LOG = `${DATA_DIR}/anomalies.log`;
const HANDLER_MODULE = `local LOG = "${ANOMALIES_LOG}"
local function append(line)
    local file = assert(io.open(LOG, "a"))
    file:write(line, "\\n")
    file:close()
end
append("loaded")
return function(kind, message)
    append(kind .. " " .. message)
end
`;

// what the player logs, from the recipes. Epochs roll every EPOCH_LENGTH
// blocks from the deploy on, so the input's epoch is read from the log
const PROCESSED_INPUT = /Epoch (\d+): processed confirmed InputAdded 0\./;
const finishedEpoch = (epoch: number) =>
    `Epoch ${epoch}: finished, no longer observed.`;

const compose = (...args: string[]) =>
    execa("docker", ["compose", "-p", projectName, ...args], {
        all: true,
        reject: false,
    });

const logsOf = async (service: string) =>
    (await compose("logs", "--no-log-prefix", service)).all ?? "";

const shell = async (service: string, script: string) => {
    const { all, exitCode } = await compose(
        "exec",
        "-T",
        service,
        "sh",
        "-c",
        script,
    );
    return { exitCode, output: (all ?? "").trim() };
};

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

describe("prt with crisium nodes", () => {
    let appDir: string;
    let cleanup: () => void;
    let run: ResultPromise | undefined;
    let application: Address;
    let output: () => string;
    let anvil: AnvilClient;

    beforeAll(async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prt-crisium-"));
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

[prt.nodes.reference]
type = "reference"
claim = false

[prt.nodes.red]
type = "crisium"
mode = "validator"
input_policy = "safe"

[prt.nodes.watch]
type = "crisium"
anomaly_handler = "${ANOMALY_HANDLER}"
`,
        );
        await fs.outputFile(path.join(appDir, ANOMALY_HANDLER), HANDLER_MODULE);

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
        try {
            await waitFor(async () => {
                if (
                    !output().includes("devnet account 20, funded by the CLI)")
                ) {
                    throw new Error("PRT nodes not started yet");
                }
            }, 180);
        } catch (error) {
            // the run and its containers are gone once the test stops them
            const logs = (
                await compose(
                    "logs",
                    "--no-log-prefix",
                    ...services.flatMap((service) => [
                        service,
                        `secret-init-${service}`,
                    ]),
                )
            ).all;
            throw new Error(
                `${String(error)}\n--- cartesi run\n${output()}\n--- PRT containers\n${logs}`,
            );
        }
        console.log("✓ PRT nodes started");
    }, TIMEOUT);

    afterAll(() => stopApplication({ cleanup, projectName, run }), TIMEOUT);

    it("should print the validator with its kind, and the sentinel with no account", () => {
        const printed = output();

        expect(printed).toContain(
            `validator red ${devnetAccount(20)} (crisium honest, devnet account 20, funded by the CLI)`,
        );
        expect(printed).toContain(
            `sentinel watch (crisium, signs nothing, anomalies to ${ANOMALY_HANDLER})`,
        );
    });

    // the module reaches the player only if the mount, LUA_PATH and the
    // argument line up; it writes the marker when crisium requires it
    it(
        "should load the sentinel's anomaly handler from the project",
        async () => {
            await waitFor(async () => {
                const { output } = await shell(
                    "prt-node-watch",
                    `cat ${ANOMALIES_LOG}`,
                );
                if (!output.startsWith("loaded")) {
                    throw new Error(`handler not loaded yet: ${output}`);
                }
            }, 60);

            expect(
                (
                    await shell(
                        "prt-node-red",
                        `test -e ${ANOMALIES_LOG} || echo none`,
                    )
                ).output,
            ).toBe("none");
        },
        TIMEOUT,
    );

    // the init service of each node stores the checkpoint it starts from, and
    // the validator's keystore, for the runtime user only
    it(
        "should store epoch 0 for both nodes, and the validator's keystore",
        async () => {
            const checkpoint = `${DATA_DIR}/checkpoints/epoch-0/epoch.json`;

            for (const service of ["prt-node-watch", "prt-node-red"]) {
                const { exitCode, output } = await shell(
                    service,
                    `test -f ${checkpoint} && echo stored`,
                );
                expect(output, service).toBe("stored");
                expect(exitCode).toBe(0);
            }

            const keystore = `${DATA_DIR}/keystore/prt-node-red`;
            const password = `${DATA_DIR}/password`;
            const address = await shell(
                "prt-node-red",
                `cast wallet address --keystore ${keystore} --password-file ${password}`,
            );
            expect(
                isAddressEqual(address.output as Address, devnetAccount(20)),
                address.output,
            ).toBe(true);
            expect(
                (
                    await shell(
                        "prt-node-red",
                        `stat -c %U:%a ${keystore} ${password}`,
                    )
                ).output,
            ).toBe("cartesi:400\ncartesi:400");
            expect(
                (
                    await shell(
                        "prt-node-watch",
                        `test -e ${keystore} || echo none`,
                    )
                ).output,
            ).toBe("none");
        },
        TIMEOUT,
    );

    // the epoch the input lands in, as the players number it
    let inputEpoch: number;

    // the validator claims and settles, the sentinel only follows; the
    // rollups-node reads, so acceptance can only come from the player
    it(
        "should follow an input, then settle its epoch from the validator's claim",
        async () => {
            await deposit(anvil, application, devnetAccount(2), 1000n);
            const start = await anvil.getBlockNumber();

            // the players count an input once its block is deep enough
            const processed = await mineUntil(anvil, async () => {
                const logs = await Promise.all(services.map(logsOf));
                return logs.every((log) => PROCESSED_INPUT.test(log));
            });
            console.log(`! Input processed after ${processed} mined blocks`);
            const epochs = await Promise.all(
                services.map(async (service) => {
                    const log = await logsOf(service);
                    const match = PROCESSED_INPUT.exec(log);
                    expect(match, `${service}\n${log}`).not.toBeNull();
                    return Number(match?.[1]);
                }),
            );
            // both players number the epochs alike
            expect(epochs[1]).toBe(epochs[0] as number);
            inputEpoch = epochs[0] as number;

            let accepted: Awaited<ReturnType<typeof getLastAcceptedEpoch>>;
            const mined = await mineUntil(anvil, async () => {
                accepted = await getLastAcceptedEpoch({
                    application,
                    projectName,
                });
                return (
                    accepted !== undefined &&
                    accepted.index >= BigInt(inputEpoch)
                );
            });
            console.log(
                `! Accepted epoch ${accepted?.index} after ${mined} mined blocks, from block ${start}; the input is in epoch ${inputEpoch}`,
            );

            const players = async () =>
                `red:\n${await logsOf("prt-node-red")}\nwatch:\n${await logsOf("prt-node-watch")}`;
            expect(accepted, await players()).toBeDefined();
            expect(accepted?.index, await players()).toBeGreaterThanOrEqual(
                BigInt(inputEpoch),
            );
            expect(await logsOf("rollups_node")).not.toContain(
                "PRT submitter identity",
            );
            // the validator's transactions, journaled in its state
            expect(
                (
                    await shell(
                        "prt-node-red",
                        `test -s ${DATA_DIR}/state/journal.json && echo journaled`,
                    )
                ).output,
            ).toBe("journaled");
        },
        TIMEOUT,
    );

    // once the epoch is settled both players move on; the honest validator
    // stores the checkpoint each next epoch starts from and prunes the ones
    // behind it, so a later checkpoint is what remains
    it(
        "should finish the input's epoch on both nodes and keep a later checkpoint",
        async () => {
            const finished = finishedEpoch(inputEpoch);
            const mined = await mineUntil(anvil, async () => {
                const logs = await Promise.all(services.map(logsOf));
                return logs.every((log) => log.includes(finished));
            });
            console.log(
                `! Epoch ${inputEpoch} finished after ${mined} more mined blocks`,
            );

            for (const service of services) {
                const log = await logsOf(service);
                expect(log, `${service}:\n${log}`).toContain(finished);
            }
            const { output } = await shell(
                "prt-node-red",
                `ls ${DATA_DIR}/checkpoints`,
            );
            const checkpoints = output
                .split("\n")
                .map((name) => Number(/^epoch-(\d+)$/.exec(name)?.[1]))
                .filter((epoch) => !Number.isNaN(epoch));
            expect(Math.max(...checkpoints), output).toBeGreaterThan(
                inputEpoch,
            );
        },
        TIMEOUT,
    );

    it("should show the node and both players in cartesi logs", async () => {
        const { all, exitCode } = await runCli({ appDir, projectName }, [
            "logs",
            "--tail",
            "5",
        ]);

        expect(exitCode).toBe(0);
        expect(all).toContain("rollups_node-1");
        expect(all).toContain("prt-node-red-1");
        expect(all).toContain("prt-node-watch-1");
    });
});
