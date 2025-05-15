import { Command, Option } from "@commander-js/extra-typings";
import input from "@inquirer/input";
import chalk from "chalk";
import { execa } from "execa";
import ora, { type Ora } from "ora";
import type { Address, Hash, Hex, PublicClient, WalletClient } from "viem";
import { encodeFunctionData, zeroHash } from "viem";
import { cannon } from "viem/chains";
import {
    getContextPath,
    getMachineHash,
    parseAddress,
    parseHash,
} from "../../base.js";
import {
    applicationFactoryAbi,
    applicationFactoryAddress,
    authorityFactoryAbi,
    authorityFactoryAddress,
    dataAvailabilityAbi,
    inputBoxAddress,
} from "../../contracts.js";
import { addressInput } from "../../prompts.js";
import type { RollupsCommandOpts } from "../rollups.js";
import { connect } from "../send.js";

/**
 * Deploy authority contract (if not already deployed)
 * @param options
 * @returns address of the authority
 */
const deployAuthority = async (
    publicClient: PublicClient,
    walletClient: WalletClient,
    options: {
        authorityOwner?: Address;
        epochLength: number;
        progress: Ora;
        salt: Hash;
    },
): Promise<Address> => {
    const { epochLength, progress, salt } = options;

    // deploy authority contract (if not already deployed)
    const authorityOwner =
        options.authorityOwner ||
        (await addressInput({
            message: "Authority Owner",
            default: walletClient.account?.address,
        }));

    const authorityAddress = await publicClient.readContract({
        abi: authorityFactoryAbi,
        address: authorityFactoryAddress,
        functionName: "calculateAuthorityAddress",
        args: [authorityOwner, BigInt(epochLength), salt],
    });

    // check if authority is already deployed
    const authorityCode = await publicClient.getCode({
        address: authorityAddress,
    });
    if (authorityCode === undefined) {
        // deploy authority
        const { request } = await publicClient.simulateContract({
            abi: authorityFactoryAbi,
            address: authorityFactoryAddress,
            account: walletClient.account,
            functionName: "newAuthority",
            args: [authorityOwner, BigInt(epochLength), salt],
        });
        progress.start("Deploying authority...");
        const hash = await walletClient.writeContract(request);
        await publicClient.waitForTransactionReceipt({ hash });
        progress.succeed(`Authority ${chalk.cyan(authorityAddress)}`);
    }

    return authorityAddress;
};

/**
 * Deploy application contract
 * @param options
 * @returns address of the application
 */
const deployApplication = async (
    publicClient: PublicClient,
    walletClient: WalletClient,
    options: {
        applicationOwner?: Address;
        authorityAddress: Address;
        progress: Ora;
        salt: Hash;
        templateHash: Hash;
        dataAvailability: Hex;
    },
): Promise<Address> => {
    const { authorityAddress, progress, salt, templateHash, dataAvailability } =
        options;

    const applicationOwner =
        options.applicationOwner ||
        (await addressInput({
            message: "Application Owner",
            default: walletClient.account?.address,
        }));

    const applicationAddress = await publicClient.readContract({
        abi: applicationFactoryAbi,
        address: applicationFactoryAddress,
        functionName: "calculateApplicationAddress",
        args: [
            authorityAddress,
            applicationOwner,
            templateHash,
            dataAvailability,
            salt,
        ],
    });

    // check if application is already deployed
    const applicationCode = await publicClient.getCode({
        address: applicationAddress,
    });

    if (applicationCode === undefined) {
        // deploy application
        const { request } = await publicClient.simulateContract({
            abi: applicationFactoryAbi,
            address: applicationFactoryAddress,
            account: walletClient.account,
            functionName: "newApplication",
            args: [
                authorityAddress,
                applicationOwner,
                templateHash,
                dataAvailability,
                salt,
            ],
        });
        progress.start("Deploying application...");
        const hash = await walletClient.writeContract(request);
        await publicClient.waitForTransactionReceipt({ hash });
        progress.succeed(`Application ${chalk.cyan(applicationAddress)}`);
    } else {
        // abort, because application is already deployed
        throw new Error(
            `Application ${chalk.cyan(templateHash)} already deployed to ${chalk.cyan(applicationAddress)}`,
        );
    }
    return applicationAddress;
};

/**
 * Publish machine snapshot to rollups node by copying it to the rollups node container
 * @param options
 * @returns path to the snapshot in the rollups node
 */
const publishMachine = async (options: {
    progress: Ora;
    environmentName: string;
    templateHash: Hash;
}): Promise<string> => {
    const { progress, environmentName, templateHash } = options;
    const snapshotPath = getContextPath("image");
    const containerSnapshotPath = `/var/lib/cartesi-rollups-node/snapshots/${templateHash}/`;
    progress.start("Publishing machine snapshot...");
    await execa("docker", [
        "compose",
        "--project-name",
        environmentName,
        "cp",
        snapshotPath,
        `rollups-node:${containerSnapshotPath}`,
    ]);
    progress.succeed(`Machine snapshot ${chalk.cyan(containerSnapshotPath)}`);
    return containerSnapshotPath;
};

/**
 * Register application in rollups node
 * @param options
 * @returns name of the application
 */
const registerApplication = async (options: {
    applicationAddress: Address;
    name?: string;
    progress: Ora;
    environmentName: string;
    snapshotPath: string;
    dataAvailability: Hex;
}): Promise<string> => {
    const {
        applicationAddress,
        progress,
        environmentName,
        snapshotPath,
        dataAvailability,
    } = options;

    // use template hash as the name of the deployment
    const name =
        options.name ??
        (await input({
            message: "Application Name",
            default: applicationAddress.toLowerCase(),
        }));

    // common app register args
    const registerArgs = [
        "--name",
        name,
        "--address",
        applicationAddress,
        "--template-path",
        snapshotPath,
        "--data-availability",
        dataAvailability,
        "--print-json",
    ];

    // deploy application
    progress.start("Registering application...");
    const { stdout } = await execa("docker", [
        "compose",
        "--project-name",
        environmentName,
        "exec",
        "rollups-node",
        "cartesi-rollups-cli",
        "app",
        "register",
        ...registerArgs,
    ]);
    const registration = stdout ? JSON.parse(stdout) : undefined;
    if (registration) {
        if (registration.state !== "ENABLED") {
            throw new Error(registration.reason);
        }
        progress.succeed(`Registration ${chalk.cyan(name)}`);
    } else {
        throw new Error("Failed to deploy application");
    }
    return name;
};

const parseDataAvailability = (
    type: "input-box" | "espresso",
    espressoBlock: number,
    espressoNamespace: number,
) => {
    if (type === "espresso") {
        return encodeFunctionData({
            abi: dataAvailabilityAbi,
            functionName: "InputBoxAndEspresso",
            args: [inputBoxAddress, BigInt(espressoBlock), espressoNamespace],
        });
    }
    return encodeFunctionData({
        abi: dataAvailabilityAbi,
        functionName: "InputBox",
        args: [inputBoxAddress],
    });
};

export const createDeployCommand = () => {
    return new Command<[], {}, RollupsCommandOpts>("deploy")
        .description("Deploy a rollups application to a rollups node.")
        .configureHelp({ showGlobalOptions: true })
        .option("--chain-id <id>", "Chain ID", Number.parseInt, 13370)
        .option("--rpc-url <url>", "RPC URL")
        .option("--mnemonic <phrase>", "Mnemonic passphrase")
        .option(
            "--mnemonic-index <index>",
            "Mnemonic account index",
            Number.parseInt,
            0,
        )
        .option("--name <string>", "application name")
        .option(
            "--authority-owner <address>",
            "authority owner",
            parseAddress,
            undefined,
        )
        .option(
            "--application-owner <address>",
            "application owner",
            parseAddress,
            undefined,
        )
        .addOption(
            new Option(
                "--epoch-length <number>",
                "length of an epoch (in blocks)",
            )
                .argParser(Number)
                .default(720),
        )
        .option("--salt <hash>", "salt for deployment", parseHash, zeroHash)
        .option("--json", "output in JSON format")
        .addOption(
            new Option(
                "--data-availability <type>",
                "Data availability layer to use (input-box or espresso)",
            )
                .choices(["input-box", "espresso"])
                .default("input-box"),
        )
        .addOption(
            new Option("--espresso-block <number>", "espresso starting block")
                .argParser(Number)
                .default(1),
        )
        .addOption(
            new Option("--espresso-namespace <number>", "espresso namespace Id")
                .argParser(Number)
                .default(1),
        )
        .action(async (options, command) => {
            const rollupsOptions = command.optsWithGlobals();
            const { environmentName } = rollupsOptions;
            const {
                json,
                dataAvailability: daType,
                espressoBlock,
                espressoNamespace,
            } = options;

            // If inputbox is chosen, warn if espresso args are provided
            if (
                daType === "input-box" &&
                (espressoBlock !== undefined || espressoNamespace !== undefined)
            ) {
                console.warn(
                    chalk.yellow(
                        "WARNING: --espresso-block and --espresso-namespace-id are ignored when --data-availability is input-box",
                    ),
                );
            }

            const progress = ora();

            // get cartesi machine snapshot hash, produced by 'build'
            const templateHash = getMachineHash();
            if (!templateHash) {
                progress.fail(
                    `Cartesi machine snapshot not found, run 'build'`,
                );
                return;
            }

            progress.succeed(
                `Cartesi machine template hash ${chalk.cyan(templateHash)}`,
            );

            // connect to some chain
            const { publicClient, walletClient } = await connect(options);

            try {
                // parse dataAvailability
                const dataAvailability = parseDataAvailability(
                    daType,
                    espressoBlock,
                    espressoNamespace,
                );

                // deploy authority contract (if not already deployed)
                const authorityAddress = await deployAuthority(
                    publicClient,
                    walletClient,
                    { progress, ...options },
                );

                // deploy application contract
                const applicationAddress = await deployApplication(
                    publicClient,
                    walletClient,
                    {
                        authorityAddress,
                        progress,
                        templateHash,
                        ...options,
                        dataAvailability,
                    },
                );

                if (publicClient.chain?.id === cannon.id) {
                    // copy machine snapshot to rollups node container
                    const containerSnapshotPath = await publishMachine({
                        progress,
                        templateHash,
                        environmentName,
                    });

                    const name = await registerApplication({
                        applicationAddress,
                        progress,
                        snapshotPath: containerSnapshotPath,
                        ...options,
                        ...rollupsOptions,
                        dataAvailability,
                    });
                } else {
                    const snapshotPath = getContextPath("image");
                    progress.succeed(
                        `Done. Manually copy machine to rollups node ${chalk.cyan(snapshotPath)}`,
                    );
                }
            } catch (e: unknown) {
                progress.fail(e instanceof Error ? e.message : "Unknown error");
            }
        });
};
