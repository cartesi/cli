import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import getPort, { portNumbers } from "get-port";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    type Address,
    decodeFunctionData,
    numberToHex,
    zeroAddress,
    zeroHash,
} from "viem";
import {
    inputBoxAbi,
    inputBoxAddress,
    inputsAbi,
    selfHostedApplicationFactoryAbi,
    selfHostedApplicationFactoryAddress,
} from "../../../src/contracts";
import {
    startEnvironment,
    stopEnvironment,
    waitHealthyEnvironment,
} from "../../../src/exec/rollups";
import { TEST_RUNTIME_VERSION } from "../config";
import { createAnvilClient, devnetAccount, runCli } from "../devnet";

// The InputBox only takes inputs for an application contract, but the node
// doesn't need to run it: each case creates one with the factory, with no
// machine behind it, and reads the sender back from the input the InputBox
// recorded.
describe("send", () => {
    const projectName = `cli-send-${process.pid}`;
    let directory: string;
    let originalCwd: string;

    beforeAll(async () => {
        originalCwd = process.cwd();
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "send-"));
        // compose files are written relative to the working directory
        process.chdir(directory);
        const port = await getPort({ port: portNumbers(16762, 16772) });
        await startEnvironment({
            blockTime: 1,
            defaultBlock: "latest",
            detach: true,
            dryRun: false,
            port,
            projectName,
            runtimeVersion: TEST_RUNTIME_VERSION,
            services: [],
            verbose: false,
        });
        await waitHealthyEnvironment({ port, projectName, services: [] });
    }, 300_000);

    afterAll(async () => {
        try {
            await stopEnvironment({ projectName });
        } finally {
            process.chdir(originalCwd);
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });

    /** Creates an application contract the node doesn't know of. */
    const createApplication = async (salt: number) => {
        const anvil = await createAnvilClient(projectName);
        const owner = devnetAccount(3);
        const { request, result } = await anvil.simulateContract({
            abi: selfHostedApplicationFactoryAbi,
            account: owner,
            address: selfHostedApplicationFactoryAddress,
            args: [
                owner,
                720n,
                0n,
                zeroHash,
                inputBoxAddress,
                {
                    guardian: zeroAddress,
                    log2LeavesPerAccount: 0,
                    log2MaxNumOfAccounts: 0,
                    accountsDriveStartIndex: 0n,
                    withdrawalOutputBuilder: zeroAddress,
                },
                numberToHex(salt, { size: 32 }),
            ],
            functionName: "deployContracts",
        });
        const hash = await anvil.writeContract(request);
        await anvil.waitForTransactionReceipt({ hash });
        return result[0];
    };

    /** Sends an input with the CLI and returns its sender. */
    const sendInput = async (application: Address, args: string[] = []) => {
        const { all, exitCode } = await runCli(
            { appDir: directory, projectName },
            [
                "send",
                "--application",
                application,
                "--encoding",
                "string",
                ...args,
                "hello",
            ],
        );
        expect(exitCode, all).toBe(0);

        const anvil = await createAnvilClient(projectName);
        const events = await anvil.getContractEvents({
            abi: inputBoxAbi,
            address: inputBoxAddress,
            args: { appContract: application },
            eventName: "InputAdded",
            fromBlock: 0n,
        });
        expect(events).toHaveLength(1);
        const { args: input } = decodeFunctionData({
            abi: inputsAbi,
            data: events[0].args.input ?? "0x",
        });
        return input[2];
    };

    // the node signs its claims with account 0, so inputs must not come from it
    it("should send from devnet account 8 by default", async () => {
        const application = await createApplication(1);

        expect(await sendInput(application)).toBe(devnetAccount(8));
    });

    it("should send from the --from account", async () => {
        const application = await createApplication(2);

        expect(await sendInput(application, ["--from", devnetAccount(2)])).toBe(
            devnetAccount(2),
        );
    });
});
