import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import fs from "fs-extra";
import ora from "ora";
import path from "path";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { waitForTransactionReceipt } from "viem/actions";
import { foundry } from "viem/chains";
import { getContextPath, getMachineHashFromDir } from "../../base.js";
import { carDetails, createCarFromDirectory } from "../../carize.js";

type DefaultUrls = {
    operatorUrl: string;
    solverUrl: string;
};

export const createDeployCommand = () => {
    return new Command("deploy")
        .description("Deploys a coprocessor framework application.")
        .argument(
            "<contractName>",
            "Name of solidity contract you intend to deploy",
        )
        .option(
            "-c, --constructorArgs [args...]",
            "Optional list of constructor arguments for the contract (space-separated values)",
        )
        .configureHelp({ showGlobalOptions: true })
        .action(async (contractName: string, options) => {
            const defaultUrls: DefaultUrls = {
                operatorUrl: "http://127.0.0.1:5001",
                solverUrl: "http://127.0.0.1:3034",
            };

            try {
                let constructorArgs: string[] | [] = [];
                if (
                    options.constructorArgs == true ||
                    options.constructorArgs == undefined
                ) {
                    constructorArgs = [];
                } else {
                    constructorArgs = options.constructorArgs;
                }

                const { cartesiDir, foundryDir } = await findSubdirectories();

                if (cartesiDir && foundryDir) {
                    const jsonOutput = await generateCarFiles(cartesiDir);
                    await publishCarFiles(cartesiDir, defaultUrls, jsonOutput);
                    await deploySolidityContract(
                        contractName,
                        constructorArgs,
                        foundryDir,
                    );
                }
            } catch (e: unknown) {
                console.log(`❌ Error deploying program: ${e}`);
            }
        });
};

const publishCarFiles = async (
    cartesiDir: string,
    DefaultUrls: DefaultUrls,
    jsonOutput: carDetails,
) => {
    const carFileName: string = "image.car";
    const artifactsDir = path.resolve(cartesiDir, getContextPath("artifacts"));
    const carFilePath = path.resolve(artifactsDir, carFileName);
    const publish_url = `${DefaultUrls.operatorUrl}/api/v0/dag/import`;
    const hash = getMachineHashFromDir(cartesiDir);

    const getEnsureRoute = (): string => {
        return `${DefaultUrls.solverUrl}/ensure/${jsonOutput.Hash}/${hash!.slice(2)}/${jsonOutput.CumulativeSize}`;
    };

    const checkCarFilesExist = (): boolean => {
        const spinner = ora("Checking for CAR file...").start();

        if (!fs.existsSync(carFilePath)) {
            spinner.fail(`No CAR file found at: ${carFilePath}`);
            return false;
        } else if (hash == undefined) {
            spinner.fail(
                "Unable to find machine hash, please run the `coprocessor build` command",
            );
            return false;
        } else {
            spinner.succeed(chalk.yellow(`CAR file found at: ${carFilePath}`));
            return true;
        }
    };

    const checkAndRetryPublish = async (
        response: string,
        retries: number,
        spinner: any,
    ): Promise<boolean> => {
        if (response.includes("ready")) {
            return true;
        } else {
            if (retries < 5) {
                await new Promise((resolve) => setTimeout(resolve, 3000));
                await publishProgramToCoprocessor(retries + 1);
            } else {
                console.log(response);
                spinner.fail(
                    chalk.red(
                        `Solver failed to publish application after ${retries} retries`,
                    ),
                );
                process.exit(1);
            }
        }
        return false;
    };

    const publishProgramToCoprocessor = async (
        retries: number,
    ): Promise<boolean> => {
        const spinner = ora("Publishing application to solver...").start();
        const ensure_url = getEnsureRoute();

        try {
            const response = await fetch(ensure_url, {
                method: "POST",
            });

            const responseString = JSON.stringify(await response.json());

            const publishStatus = await checkAndRetryPublish(
                responseString,
                retries,
                spinner,
            );

            if (publishStatus) {
                spinner.succeed(
                    chalk.green(
                        `Application sucessfully published to solver at: ${chalk.cyan(DefaultUrls.solverUrl)}`,
                    ),
                );
                return true;
            } else {
                spinner.stop();
                return false;
            }
        } catch (err: any) {
            console.log(
                chalk.red("Failed to send POST request to ensure endpoint."),
            );

            const message = err?.message || "";
            if (
                message.includes("Failed to connect to") ||
                message.includes("Couldn't connect to server")
            ) {
                spinner.fail(
                    chalk.red(
                        "Devnet container not active, please run the start devnet command!",
                    ),
                );
            } else {
                spinner.fail(
                    chalk.red("Error Publishing application: \n", message),
                );
            }
            return false;
        }
    };

    const UploadCarFile = async (): Promise<boolean> => {
        const spinner = ora("Uploading car files...").start();

        if (!checkCarFilesExist()) {
            spinner.stop();
            return false;
        }

        try {
            // Create form data
            const form = new FormData();
            form.append(
                "file",
                new Blob([fs.readFileSync(carFilePath)], {
                    type: "application/octet-stream",
                }),
                "image.car",
            );

            const response = await fetch(publish_url, {
                method: "POST",
                body: form,
            });

            if (response.status >= 200 && response.status < 300) {
                spinner.succeed(chalk.green("Carfiles uploaded successfully."));
                return true;
            } else {
                spinner.fail("Error uploading carfiles");
                return false;
            }
        } catch (e: any) {
            if (
                e.message.includes("ECONNREFUSED") ||
                e.message == "fetch failed"
            ) {
                spinner.fail(
                    chalk.red(
                        "Devnet container not active, please run the `start devnet` command!",
                    ),
                );
                return false;
            } else {
                spinner.fail(
                    e instanceof Error
                        ? `Error Uploading application: ${chalk.red(e.message)}`
                        : String(e),
                );
                return false;
            }
        }
    };

    if (await UploadCarFile()) {
        if (await publishProgramToCoprocessor(0)) {
            return;
        } else {
            process.exit(1);
        }
    } else {
        process.exit(1);
    }
};

const generateCarFiles = async (cartesiDir: string): Promise<carDetails> => {
    const artifactsDir = path.resolve(cartesiDir, getContextPath("artifacts"));
    const snapshotPath = path.resolve(cartesiDir, getContextPath("image"));
    const pathExists = await fs.pathExists(snapshotPath);
    await fs.promises.mkdir(artifactsDir, { recursive: true });

    if (!pathExists) {
        console.log(
            chalk.red(
                `${chalk.red("✖")} Machine snapshot not found, run the 'coprocessor build' command!`,
            ),
        );
        process.exit(1);
    } else {
        try {
            const jsonOutput = await createCarFromDirectory(
                snapshotPath,
                artifactsDir,
            );
            console.log(
                chalk.green("🎉 CAR and JSON files successfully created!"),
            );
            return jsonOutput;
        } catch (e: unknown) {
            console.log(
                `${chalk.red("✖")} Error creating car files: ${chalk.red(e)}`,
            );
            process.exit(1);
        }
    }
};

const deploySolidityContract = async (
    contractName: string,
    constructorArgs: string[],
    foundryDir: string,
) => {
    const DEFAULT_ANVIL_PRIVATE_KEY =
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

    const artifactPath = path.resolve(
        foundryDir,
        "out",
        `${contractName}.sol`,
        `${contractName}.json`,
    );

    // Check if artifact exists
    if (!(await fs.pathExists(artifactPath))) {
        console.error(
            chalk.redBright("❌ Contract artifact not found at: ") +
                chalk.yellow(artifactPath),
        );
        console.log(
            chalk.cyan("👉 Please build your contract first using ") +
                chalk.magenta("forge build") +
                chalk.cyan(" or ") +
                chalk.magenta("hardhat compile"),
        );
        process.exit(1);
    } else {
        console.log(
            chalk.yellow(
                `✅ Found ${contractName} build file at: ${artifactPath}`,
            ),
        );
    }

    // Load artifact
    const artifact = await fs.readJson(artifactPath);
    const abi = artifact.abi;
    const bytecode = artifact.bytecode.object ?? artifact.bytecode;

    // Set up signer
    const account = privateKeyToAccount(
        DEFAULT_ANVIL_PRIVATE_KEY as `0x${string}`,
    );

    const client = createWalletClient({
        account,
        chain: foundry,
        transport: http(),
    });

    const spinner = ora("📦 Deploying contract to localhost...").start();

    try {
        // Deploy
        const hash = await client.deployContract({
            abi,
            bytecode: bytecode as `0x${string}`,
            args: constructorArgs,
        });
        const receipt = await waitForTransactionReceipt(client, { hash });

        spinner.succeed(chalk.green(`Deployment transaction hash: ${hash}`));
        console.log(
            chalk.green("✅ Contract deployed at:", receipt.contractAddress),
        );
    } catch (e: any) {
        spinner.fail(chalk.red("Error deploying solidity contract!!"));
        const ERROR = `${e.shortMessage ? e.shortMessage : e}`;
        if (ERROR.includes("Execution reverted for an unknown")) {
            console.log(
                chalk.red(
                    `❌ Viem:: ${ERROR}. Please ensure constructor arguments are well passed`,
                ),
            );
        } else {
            console.log(chalk.red(`❌ Viem::   ${ERROR}`));
        }
    }
};

const findSubdirectories = async (): Promise<{
    cartesiDir: string | null;
    foundryDir: string | null;
}> => {
    // Get all subdirectories in the current working directory
    const getSubdirectories = async (dir: string): Promise<string[]> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => path.join(dir, entry.name));
    };

    // Check if a subdirectory contains a given file or folder
    const hasChild = async (dir: string, name: string): Promise<boolean> => {
        const target = path.join(dir, name);
        return fs.pathExists(target);
    };

    const iterateSubdirectories = async (dir: string) => {
        const subdirs = await getSubdirectories(dir);

        let cartesiDir: string | null = null;
        let foundryDir: string | null = null;

        for (const dir of subdirs) {
            if (!cartesiDir && (await hasChild(dir, getContextPath()))) {
                cartesiDir = dir;
            }
            if (!foundryDir && (await hasChild(dir, "foundry.toml"))) {
                foundryDir = dir;
            }

            // Break early if both are found
            if (cartesiDir && foundryDir) break;
        }

        return { cartesiDir, foundryDir };
    };

    try {
        const cwd = process.cwd();

        let { cartesiDir, foundryDir } = await iterateSubdirectories(cwd);

        if (!cartesiDir && !foundryDir) {
            const newCwd = path.resolve(cwd, "..");
            ({ cartesiDir, foundryDir } = await iterateSubdirectories(newCwd));
        }

        console.log(
            cartesiDir
                ? chalk.yellow(`✅ Found .cartesi folder in: ${cartesiDir}`)
                : chalk.red(`❌ No subdirectory with .cartesi folder found.`),
        );

        console.log(
            foundryDir
                ? chalk.yellow(`✅ Found foundry.toml in: ${foundryDir}`)
                : chalk.red(`❌ No subdirectory with foundry.toml found.`),
        );

        return { cartesiDir, foundryDir };
    } catch (err) {
        console.error(
            "Unexpected error locating necessary subdirectories:",
            err,
        );
        return { cartesiDir: null, foundryDir: null };
    }
};
