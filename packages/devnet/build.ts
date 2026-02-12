import { semver } from "bun";
import { existsSync, readdirSync } from "fs-extra";
import { Listr, type ListrTask } from "listr2";
import * as anvil from "./anvil";
import { downloadAndExtract } from "./download";
import path = require("node:path");

const ANVIL_VERSION = "1.4.3";
const ROLLUPS_VERSION = "2.1.1";
const PRT_VERSION = "2.0.1";

/**
 * Tasks to download and extract dependencies
 */
const dependencies: ListrTask[] = [
    {
        url: `https://github.com/cartesi/dave/releases/download/v${PRT_VERSION}/cartesi-rollups-prt-anvil-v${ANVIL_VERSION}.tar.gz`,
        destination: "build",
    },
    {
        url: `https://github.com/cartesi/dave/releases/download/v${PRT_VERSION}/cartesi-rollups-prt-contract-artifacts.tar.gz`,
        destination: "out",
        stripComponents: 3,
    },
    {
        url: `https://github.com/cartesi/rollups-contracts/releases/download/v${ROLLUPS_VERSION}/rollups-contracts-${ROLLUPS_VERSION}-artifacts.tar.gz`,
        destination: "out",
    },
].map((file) => ({
    title: `${file.url} -> ${file.destination}`,
    task: async () => await downloadAndExtract(file),
}));

/**
 * Deploy contracts using forge script
 * @param options - The options for deploying contracts
 * @param options.privateKey - The private key to use for the deployment
 * @param options.rpcUrl - The RPC URL to use for the deployment
 * @returns
 */
const deploy = async (options: { privateKey: string; rpcUrl: string }) => {
    // execute forge script
    const proc = Bun.spawn(
        [
            "forge",
            "script",
            "Deploy",
            "--broadcast",
            "--non-interactive",
            "--private-key",
            options.privateKey,
            "--rpc-url",
            options.rpcUrl,
            "--slow",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
    );
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
        throw new Error(`Forge script exited with code ${exitCode}`, {
            cause: await new Response(proc.stderr).text(),
        });
    }
    return exitCode;
};

/**
 * Generate artifacts from deployed contracts (with { abi, address, contractName })
 * @returns
 */
const artifacts = (dir: string) => {
    return readdirSync(dir).map((file) => ({
        title: file,
        task: async () => {
            const deployment = await Bun.file(path.join(dir, file)).json();
            const { address, contractName } = deployment;

            const filename = path.join(
                "out",
                `${contractName}.sol`,
                `${contractName}.json`,
            );

            // read abi from forge artifact (if it exists, error if it doesn't)
            const { abi } = existsSync(filename)
                ? await Bun.file(filename).json()
                : undefined;
            if (!abi) {
                throw new Error(`ABI file not found for ${contractName}`);
            }

            // write deployments (with { abi, address, contractName })
            const artifact = path.join("deployments", `${contractName}.json`);
            return Bun.write(
                artifact,
                JSON.stringify({ abi, address, contractName }, null, 2),
            );
        },
    }));
};

const build = async () => {
    type Ctx = {
        anvilProc?: Bun.Subprocess;
        dumpState: string;
        privateKey: string;
        rpcUrl: string;
    };

    const tasks = new Listr<Ctx>(
        [
            {
                title: "Checking anvil version",
                task: async (_, task) => {
                    // check is required anvil version is installed
                    const anvilVersion = await anvil.version();
                    if (!semver.satisfies(anvilVersion, ANVIL_VERSION)) {
                        throw new Error(
                            `Anvil version ${anvilVersion} is not the expected version ${ANVIL_VERSION}`,
                        );
                    }
                    task.title = `Anvil version ${anvilVersion} is installed`;
                },
            },
            {
                title: "Download dependencies",
                task: async (_, task) =>
                    task.newListr(dependencies, { concurrent: true }),
            },
            {
                title: "Starting anvil...",
                task: async (ctx, task) => {
                    const { dumpState } = ctx;

                    // start anvil
                    ctx.anvilProc = await anvil.start({
                        loadState: `build/state.json`,
                        dumpState,
                    });

                    // setup graceful anvil shutdown, just in case process is terminated prematurely
                    const shutdown = async () => {
                        await anvil.stop(ctx.anvilProc);
                    };
                    process.on("SIGINT", shutdown);
                    process.on("SIGTERM", shutdown);

                    task.title = `Anvil started (PID: ${ctx.anvilProc.pid})`;
                },
            },
            {
                title: "Deploying contracts...",
                task: async (ctx, task) => {
                    const { privateKey, rpcUrl } = ctx;
                    await deploy({ privateKey, rpcUrl });
                    task.title = "Contracts deployed";
                },
            },
            {
                title: "Generating artifacts",
                task: async (_, task) =>
                    task.newListr(
                        artifacts(path.join("build", "deployments", "31337")),
                        { concurrent: true },
                    ),
            },
            {
                title: "Stopping anvil...",
                task: async (ctx, task) => {
                    if (ctx.anvilProc) {
                        // kill anvil gracefully
                        await anvil.stop(ctx.anvilProc);
                    }
                    task.title = `Anvil stopped -> ${ctx.dumpState}`;
                },
            },
        ],
        { exitOnError: false },
    );

    await tasks.run({
        privateKey:
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        rpcUrl: "http://127.0.0.1:8545",
        dumpState: "anvil_state.json",
    });

    // exit with error code if any task failed
    const failed = tasks.tasks.some((task) => task.hasFailed());
    if (failed) {
        process.exit(1);
    }
};

build().catch(() => {
    process.exit(1);
});
