import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import { execa } from "execa";
import fs from "fs-extra";
import ora from "ora";
import path from "path";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { waitForTransactionReceipt } from "viem/actions";
import { foundry } from "viem/chains";
import { getMachineHashFromDir } from "../../base.js";

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
                    if (await generateCarFiles(cartesiDir)) {
                        if (await publishCarFiles(cartesiDir)) {
                            await deploySolidityContract(
                                contractName,
                                constructorArgs,
                                foundryDir,
                            );
                        } else {
                            return;
                        }
                    } else {
                        return;
                    }
                }
            } catch (e: unknown) {
                console.log(`❌ Error deploying program: ${e}`);
            }
        });
};

const publishCarFiles = async (cartesiDir: string): Promise<boolean> => {
    const DEFAULT_OPERATOR_URL = "http://127.0.0.1:5001";
    const DEFAULT_SOLVER_URL = "http://127.0.0.1:3034";
    const carFileName: string = "output.car";
    const artifactsDir = path.resolve(cartesiDir, ".cartesi", "artifacts");
    const carFilePath = path.resolve(artifactsDir, carFileName);
    const cidFilePath = path.resolve(artifactsDir, "output.cid");
    const sizeFilePath = path.resolve(artifactsDir, "output.size");
    const publish_url = `${DEFAULT_OPERATOR_URL}/api/v0/dag/import`;
    const hash = getMachineHashFromDir(cartesiDir);

    const getEnsureRoute = (
        cid: string,
        machineHash: string,
        size: string,
    ): string => {
        return `${DEFAULT_SOLVER_URL}/ensure/${cid}/${machineHash}/${size}`;
    };

    const readFile = (filePath: string, label: string) => {
        try {
            return fs.readFileSync(filePath, "utf-8").trim();
        } catch (err) {
            console.log(chalk.red(`Failed to read ${label}: ${err}`));
            return undefined;
        }
    };

    const checkCarFilesExist = (carFilePath: string): boolean => {
        const spinner = ora("Checking for CAR file...").start();

        if (!fs.existsSync(carFilePath)) {
            spinner.fail(`No CAR file found at: ${carFilePath}`);
            return false;
        } else if (!fs.existsSync(cidFilePath)) {
            spinner.fail("Missing required CAR output file: output.cid");
            return false;
        } else if (!fs.existsSync(sizeFilePath)) {
            spinner.fail("Missing required CAR output file: output.size");
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
                publishProgramToCoprocessor(retries + 1);
            } else {
                spinner.fail(
                    chalk.red(
                        `Solver failed to publish application after ${retries} retries`,
                    ),
                );
                return false;
            }
        }
        return false;
    };

    const publishProgramToCoprocessor = async (
        retries: number,
    ): Promise<boolean> => {
        const spinner = ora("Publishing application to solver...").start();
        const cid = readFile(cidFilePath, "CID File");
        const size = readFile(sizeFilePath, "SIZE File");
        const ensure_url = getEnsureRoute(
            cid as string,
            hash!.slice(2) as string,
            size as string,
        );

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
                        `Application sucessfully published to solver at: ${chalk.cyan(DEFAULT_SOLVER_URL)}`,
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
                    chalk.red("Error Publishing application:", message),
                );
            }
            return false;
        }
    };

    const UploadCarFile = async (): Promise<boolean> => {
        const spinner = ora("Uploading car files...").start();

        if (!checkCarFilesExist(carFilePath)) {
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
                "output.car",
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
            if (e.message.includes("ECONNREFUSED")) {
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

    return (await UploadCarFile())
        ? await publishProgramToCoprocessor(0)
        : false;
};

const generateCarFiles = async (cartesiDir: string) => {
    type Service = {
        name: string; // name of the service
        file: string; // docker compose file name
        healthySemaphore?: string; // service to check if the service is healthy
        healthyTitle?: string | ((port: number) => string); // title of the service when it is healthy
        waitTitle?: string; // title of the service when it is starting
        errorTitle?: string; // title of the service when it is not healthy
    };

    const snapshotPath = path.resolve(cartesiDir, ".cartesi/image");
    const pathExists = await fs.pathExists(snapshotPath);

    if (!pathExists) {
        console.log(
            chalk.red(
                `${chalk.red("✖")} Machine snapshot not found, run the 'coprocessor build' command!`,
            ),
        );
        return false;
    } else {
        const coprocessorCarizeServices: Service[] = [
            {
                name: "carize",
                file: "coprocessor/docker-compose-carize.yaml",
                waitTitle: `${chalk.cyan("Generating Car files.....")}`,
                errorTitle: `${chalk.red("Error cenerating car files")}`,
            },
        ];

        // path of the tool instalation
        const binPath = path.join(
            path.dirname(new URL(import.meta.url).pathname),
            "../..",
        );

        const dataPath = path.resolve(cartesiDir, ".cartesi/image");
        const outputPath = path.resolve(cartesiDir, ".cartesi/artifacts");

        const env: NodeJS.ProcessEnv = {
            CARIZE_DATA: dataPath,
            CARIZE_OUTPUT: outputPath,
        };

        // build a list of unique compose files
        const composeFiles = [
            ...new Set(coprocessorCarizeServices.map(({ file }) => file)),
        ];

        // create the "--file <file>" list
        const files = composeFiles
            .map((f) => ["--file", path.join(binPath, "compose", f)])
            .flat();

        const compose_args = [
            "compose",
            ...files,
            "--project-name",
            `coprocessor_carize`,
            "--progress",
            "quiet",
        ];

        const up_args = ["--attach", "carize"];

        // XXX: need this handler, so SIGINT can still call the finally block below
        process.on("SIGINT", () => {});

        try {
            await execa("docker", [...compose_args, "up", ...up_args], {
                env,
                stdio: "inherit",
            });
            console.log(
                `${chalk.green("✔")} Car files generated sucessfully!`,
            );
            return true;
        } catch (e: unknown) {
            // 130 is a graceful shutdown, so we can swallow it
            if ((e as any).exitCode !== 130) {
                console.log(
                    `${chalk.red("✖")} Error creating car files: ${chalk.red(e)}`,
                );
            }
            return false;
        } finally {
            await execa("docker", [...compose_args, "down", "--volumes"], {
                env,
                stdio: "inherit",
            });
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
        // 🚀 Deploy
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
        let error = `${e.shortMessage ? e.shortMessage : e}`;
        if (error.includes("Execution reverted for an unknown")) {
            console.log(
                chalk.red(
                    `❌ Viem:: ${error}. Please ensure constructor arguments are well passed`,
                ),
            );
        } else {
            console.log(chalk.red(`❌ Viem::   ${error}`));
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
            if (!cartesiDir && (await hasChild(dir, ".cartesi"))) {
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
