import { expect } from "bun:test";
import { type ResultPromise, execa } from "execa";
import path from "node:path";
import pRetry, { AbortError } from "p-retry";
import {
    type Address,
    createTestClient,
    http,
    publicActions,
    walletActions,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { DEVNET_MNEMONIC } from "../../src/compose/node";
import {
    erc20PortalAbi,
    erc20PortalAddress,
    testUsdcAbi,
    testUsdcAddress,
} from "../../src/contracts";
import {
    getDeployments,
    getLastAcceptedEpoch,
    getProjectPort,
    stopEnvironment,
} from "../../src/exec/rollups";
import { cartesi } from "../../src/wallet";
import { TEST_RUNTIME_VERSION } from "./config";

/**
 * Helpers to run an application on a devnet environment, and to drive it
 * through the CLI and the devnet's anvil.
 */

export const TIMEOUT = 30 * 60 * 1000;

export const cliPath = path.join(__dirname, "..", "..", "dist", "index.js");

export const devnetAccount = (addressIndex: number) =>
    mnemonicToAccount(DEVNET_MNEMONIC, { addressIndex }).address;

export const waitFor = <T>(fn: () => Promise<T>, retries = 120) =>
    pRetry(fn, { retries, minTimeout: 1000, maxTimeout: 1000 });

/**
 * Runs the CLI in the application directory, against its environment.
 */
export const runCli = (
    options: { appDir: string; projectName: string },
    args: string[],
    env?: Record<string, string>,
) =>
    execa("node", [cliPath, ...args, "--project-name", options.projectName], {
        all: true,
        cwd: options.appDir,
        env,
        reject: false,
    });

/**
 * Builds the application in its directory with the CLI.
 */
export const buildApplication = (appDir: string) =>
    execa("node", [cliPath, "build"], {
        all: true,
        cwd: appDir,
        reject: false,
    });

export const createAnvilClient = async (projectName: string) => {
    const host = await getProjectPort({ projectName });
    return createTestClient({
        chain: cartesi,
        mode: "anvil",
        transport: http(`http://${host}/anvil`),
        pollingInterval: 200,
    })
        .extend(publicActions)
        .extend(walletActions);
};

export type AnvilClient = Awaited<ReturnType<typeof createAnvilClient>>;

export const usdcBalance = (anvil: AnvilClient, owner: Address) =>
    anvil.readContract({
        abi: testUsdcAbi,
        address: testUsdcAddress,
        args: [owner],
        functionName: "balanceOf",
    });

/**
 * Mints test USDC to an account and deposits it into the application.
 */
export const deposit = async (
    anvil: AnvilClient,
    application: Address,
    from: Address,
    amount: bigint,
) => {
    await anvil.impersonateAccount({ address: from });
    const transactions = [
        () =>
            anvil.writeContract({
                abi: testUsdcAbi,
                account: from,
                address: testUsdcAddress,
                args: [amount],
                functionName: "mint",
            }),
        () =>
            anvil.writeContract({
                abi: testUsdcAbi,
                account: from,
                address: testUsdcAddress,
                args: [erc20PortalAddress, amount],
                functionName: "approve",
            }),
        () =>
            anvil.writeContract({
                abi: erc20PortalAbi,
                account: from,
                address: erc20PortalAddress,
                args: [testUsdcAddress, application, amount, "0x"],
                functionName: "depositErc20Tokens",
            }),
    ];
    for (const transaction of transactions) {
        const hash = await transaction();
        const receipt = await anvil.waitForTransactionReceipt({ hash });
        expect(receipt.status).toBe("success");
    }
};

/**
 * Starts the environment with `cartesi run` and waits for the application to
 * be deployed.
 */
export const startApplication = async (options: {
    appDir: string;
    epochLength: number;
    projectName: string;
}): Promise<{ application: Address; run: ResultPromise }> => {
    const { appDir, epochLength, projectName } = options;

    // without a terminal the environment runs in the foreground
    console.log(`! Starting the environment ${projectName}...`);
    const run = execa(
        "node",
        [
            cliPath,
            "run",
            "--project-name",
            projectName,
            "--runtime-version",
            TEST_RUNTIME_VERSION,
            "--epoch-length",
            epochLength.toString(),
            "--block-time",
            "1",
        ],
        {
            all: true,
            cwd: appDir,
            reject: false,
        },
    );

    const application = await waitFor(async () => {
        if (run.nodeChildProcess.exitCode !== null) {
            const { all } = await run;
            throw new AbortError(`cartesi run exited\n${all}`);
        }
        const [deployment] = await getDeployments({ projectName });
        if (!deployment) {
            throw new Error("application not deployed yet");
        }
        return deployment.address;
    }, 600);
    console.log(`✓ Application deployed at ${application}`);

    return { application, run };
};

/**
 * Waits for a claim of the application to be accepted.
 */
export const waitForAcceptedEpoch = (options: {
    application: Address;
    projectName: string;
}) =>
    waitFor(async () => {
        const accepted = await getLastAcceptedEpoch(options);
        if (!accepted) {
            throw new Error("no accepted epoch yet");
        }
        return accepted;
    });

/**
 * Stops the environment of `startApplication`, and removes the application directory.
 */
export const stopApplication = async (options: {
    cleanup?: () => void;
    projectName: string;
    run?: ResultPromise;
}) => {
    const { cleanup, projectName, run } = options;
    await stopEnvironment({ projectName }).catch(() => undefined);
    run?.kill();
    cleanup?.();
};
