import { semver } from "bun";
import { cpSync, existsSync, readdirSync } from "fs-extra";
import { Listr, type ListrTask } from "listr2";
import * as path from "node:path";
import {
    arbitrum,
    arbitrumSepolia,
    base,
    baseSepolia,
    mainnet,
    optimism,
    optimismSepolia,
    sepolia,
} from "viem/chains";
import * as anvil from "./anvil";
import { downloadAndExtract } from "./download";

const ANVIL_VERSION = "1.4.3";
const ROLLUPS_VERSION = "3.0.0-alpha.6";
const PRT_VERSION = "3.0.0-alpha.3";

const supportedChains = {
    arbitrum,
    arbitrumSepolia,
    base,
    baseSepolia,
    mainnet,
    optimism,
    optimismSepolia,
    sepolia,
};

/**
 * Tasks to download and extract dependencies
 */
const dependencies: ListrTask[] = [
    {
        url: `https://github.com/cartesi/dave/releases/download/v${PRT_VERSION}/cartesi-rollups-prt-${PRT_VERSION}-anvil-v${ANVIL_VERSION}.tar.gz`,
        destination: "build",
    },
    {
        url: `https://github.com/cartesi/dave/releases/download/v${PRT_VERSION}/cartesi-rollups-prt-${PRT_VERSION}-deployment-addresses.tar.gz`,
        destination: "build",
    },
    {
        url: `https://github.com/cartesi/dave/releases/download/v${PRT_VERSION}/cartesi-rollups-prt-${PRT_VERSION}-contract-artifacts.tar.gz`,
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

type ContractDeployments = Record<string, { address: string; abi: any }>;

/**
 * Collect contracts from deployments, objects keyed by contractName, with abi and address
 * @returns
 */
const collectContracts = async (dir: string): Promise<ContractDeployments> => {
    const deployments = await Promise.all(
        readdirSync(dir, { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => path.join(entry.parentPath, entry.name))
            .map(async (file) => {
                const deployment = await Bun.file(file).json();
                let { abi, address, contractName } = deployment;

                // if abi exist in original file, use it
                if (!abi) {
                    // otherwise read abi from forge artifact (if it exists, error if it doesn't)
                    const filename = path.join(
                        "out",
                        `${contractName}.sol`,
                        `${contractName}.json`,
                    );

                    const artifact = existsSync(filename)
                        ? await Bun.file(filename).json()
                        : undefined;

                    abi = artifact?.abi;
                }
                if (!abi) {
                    throw new Error(`ABI file not found for ${contractName}`);
                }

                return { abi, address, contractName };
            }),
    );

    return deployments.reduce(
        (contracts, deployment) => {
            const { abi, address, contractName } = deployment;
            contracts[contractName] = { abi, address };
            return contracts;
        },
        {} as Record<string, { abi: any; address: string }>,
    );
};

/**
 * Prepare deployment information per chain
 * by collection contract information based on GitHub release from cartesi-rollups-prt
 * @param options.chainId - chainId to export
 */
const perChainDeploymentTasks: ListrTask[] = Object.entries(
    supportedChains,
).map(([name, chain]) => ({
    title: `Prepare deployment for chain ${chain.id} for cartesi-rollups-prt ${PRT_VERSION}`,
    task: async () => {
        const chainId = chain.id.toString();
        const exportDir = path.join("build", "deployments", chainId);
        const contracts = await collectContracts(exportDir);

        const filename = path.join("deployments", `${name}.json`);
        await Bun.write(
            filename,
            JSON.stringify({
                name,
                chainId,
                contracts,
            }),
        );
    },
}));

/**
 * Deploy contracts using forge script
 * @param options - The options for deploying contracts
 * @param options.privateKey - The private key to use for the deployment
 * @param options.rpcUrl - The RPC URL to use for the deployment
 * @returns <number> - the exit code of the deployment script, 0 if successful
 * @throws {Error} - if the deployment script exits with a non-zero code, the error message will contain the stderr output of the script
 */
const runDeploymentScript = async (
    scriptName: string,
    options: { privateKey: string; rpcUrl: string },
) => {
    const proc = Bun.spawn(
        [
            "forge",
            "script",
            scriptName,
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

const deploy = async (options: { privateKey: string; rpcUrl: string }) => {
    const contractName = "UsdWithdrawalOutputBuilder";

    // Deploys an UsdWithdrawalOutputBuilder but saves the deployment information as TestUsdWithdrawalOutputBuilder.
    const exitCode = await runDeploymentScript(
        `DeployTest${contractName}`,
        options,
    );

    if (exitCode === 0) {
        // To continue the build process, we make sure there is a copy of the expected <contract-name>.sol folder + JSON content with added prefix
        // in the name (i.e. Test<contract-name>[.sol, .json]) in the out folder. Therefore, the rest of the process can find the expected information
        // and copy it to the right place.
        const targetPath = path.join(
            "out",
            `${contractName}.sol`,
            `${contractName}.json`,
        );
        const destinationPath = path.join(
            "out",
            `Test${contractName}.sol`,
            `Test${contractName}.json`,
        );
        createCopy(targetPath, destinationPath);
    }

    return exitCode;
};

/**
 * Copy file or directory from source to destination, if source is a directory it will be copied recursively,
 * if destination already exist it will be overwritten.
 * @param source - path to file or directory to be copied
 * @param destination - path to destination where file or directory should be copied
 * @returns true if copy was successful, otherwise throws an error
 * @throws {Error} if copy operation fails, the error message will contain the original error message
 */
const createCopy = (source: string, destination: string) => {
    try {
        cpSync(source, destination, { recursive: true, force: true });
        console.info(`Source copied from ${source} to ${destination}`);
    } catch (error) {
        throw new Error(`Failed to copy from ${source} to ${destination}`, {
            cause: (error as Error).message,
        });
    }

    return true;
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
                    task.newListr(dependencies, { concurrent: false }),
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
                        if (ctx.anvilProc) {
                            await anvil.stop(ctx.anvilProc);
                        }
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
                title: "Generating local deployment",
                task: async (_, task) => {
                    // load deployments structure
                    const contracts = await collectContracts(
                        path.join("build", "deployments", "31337"),
                    );

                    // write to anvil.json
                    const destination = path.join("deployments", "anvil.json");
                    await Bun.write(
                        destination,
                        JSON.stringify({
                            name: "anvil",
                            chainId: "31337",
                            contracts,
                        }),
                    );
                    task.title = `Local deployments written to ${destination}`;
                },
            },
            {
                title: "Generate deployment per supported chain",
                task: async (_, task) =>
                    task.newListr(perChainDeploymentTasks, {
                        concurrent: true,
                    }),
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
        { exitOnError: true },
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
