import { Command, Option } from "@commander-js/extra-typings";
import input from "@inquirer/input";
import chalk from "chalk";
import { execa } from "execa";
import ora, { Ora } from "ora";
import {
    Address,
    encodeFunctionData,
    Hash,
    PublicClient,
    WalletClient,
    zeroHash,
} from "viem";
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
import { RollupsCommandOpts } from "../rollups.js";
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
    },
): Promise<Address> => {
    const { authorityAddress, progress, salt, templateHash } = options;

    const applicationOwner =
        options.applicationOwner ||
        (await addressInput({
            message: "Application Owner",
            default: walletClient.account?.address,
        }));

    // create data availability descriptor for InputBox only
    const dataAvailability = encodeFunctionData({
        abi: dataAvailabilityAbi,
        functionName: "InputBox",
        args: [inputBoxAddress],
    });

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
}): Promise<string> => {
    const { applicationAddress, progress, environmentName, snapshotPath } =
        options;

    // use template hash as the name of the deployment
    const name =
        options.name ??
        (await input({
            message: "Application Name",
            default: applicationAddress.toLowerCase(),
        }));

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
        "--name",
        name,
        "--address",
        applicationAddress,
        "--template-path",
        snapshotPath,
        "--print-json",
    ]);
    const registration = stdout ? JSON.parse(stdout) : undefined;
    if (registration) {
        if (registration.State !== "ENABLED") {
            throw new Error(registration.Reason);
        }
        progress.succeed(`Registration ${chalk.cyan(name)}`);
    } else {
        throw new Error("Failed to deploy application");
    }
    return name;
};

export const createDeployCommand = () => {
    return new Command<[], {}, RollupsCommandOpts>("deploy")
        .description("Deploy a rollups application to a rollups node.")
        .configureHelp({ showGlobalOptions: true })
        .option("--chain-id <id>", "Chain ID", parseInt, 13370)
        .option("--rpc-url <url>", "RPC URL")
        .option("--mnemonic <phrase>", "Mnemonic passphrase")
        .option(
            "--mnemonic-index <index>",
            "Mnemonic account index",
            parseInt,
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
        .action(async (options, command) => {
            const rollupsOptions = command.optsWithGlobals();
            const { environmentName } = rollupsOptions;
            const { json } = options;
            // XXX: json support is not implemented yet
            // if case of json maybe we should not support interactive mode

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
                    { authorityAddress, progress, templateHash, ...options },
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
