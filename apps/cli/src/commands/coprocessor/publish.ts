import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import fs from "fs";
import ora from "ora";
import path from "path";
import { getMachineHash } from "../../base.js";

const DEFAULT_OPERATOR_URL = "http://127.0.0.1:5001";
const DEFAULT_SOLVER_URL = "http://127.0.0.1:3034";
const carFileName: string = "output.car";
const artifactsDir = path.resolve(process.cwd(), ".cartesi", "artifacts");
const carFilePath = path.resolve(artifactsDir, carFileName);
const cidFilePath = path.resolve(artifactsDir, "output.cid");
const sizeFilePath = path.resolve(artifactsDir, "output.size");
const publish_url = `${DEFAULT_OPERATOR_URL}/api/v0/dag/import`;
const hash = getMachineHash();

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
            "Unable to find machine hash, please run the build command",
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
) => {
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
};

const publishProgramToCoprocessor = async (retries: number) => {
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

        let responseString = JSON.stringify(await response.json());

        let publishStatus = await checkAndRetryPublish(
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
        } else {
            spinner.stop();
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
            spinner.fail(chalk.red("Error:", message));
        }
    }
};

export const createPublishCommand = () => {
    return new Command("publish")
        .description(
            "Publish your machine hash along with car files to the solver.",
        )
        .action(async () => {
            if (!checkCarFilesExist(carFilePath)) {
                return;
            }
            const spinner = ora("Publishing application...").start();
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
                    spinner.succeed(
                        chalk.green("Carfile uploaded successfully."),
                    );
                    await publishProgramToCoprocessor(0);
                }
            } catch (e: any) {
                if (e.message.includes("ECONNREFUSED")) {
                    spinner.fail(
                        chalk.red(
                            "Devnet container not active, please run the `start devnet` command!",
                        ),
                    );
                } else {
                    spinner.fail(
                        e instanceof Error
                            ? `Error publishing application: ${chalk.red(e.message)}`
                            : String(e),
                    );
                }
            }
        });
};
