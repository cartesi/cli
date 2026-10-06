import { Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import {
    type Address,
    type Hex,
    isAddressEqual,
    isHex,
    zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
    type CartesiEnvironmentVariables,
    getCartesiEnvironmentVariables,
    getProjectName,
} from "../base.js";
import {
    getNodeSigner,
    handleNodeCommandError,
    type NodeSigner,
    runNodeCommand,
    transactionArgs,
} from "../exec/rollups.js";
import {
    getNodeClient,
    parseAccountIndex,
    resolveNodeApplication,
} from "../node.js";
import { findMnemonicAccountIndex } from "../wallet.js";

/**
 * Signer given for a single foreclose, in the environment of the shell that
 * runs it, so the guardian can be an account the node doesn't sign with
 */
export type HostSigner =
    | { kind: "mnemonic"; mnemonic: string }
    | { kind: "private_key"; privateKey: Hex };

/**
 * Read the per-command signer from the CARTESI_AUTH_* environment variables
 * of the host, following cartesi-rollups-cli: CARTESI_AUTH_KIND picks the
 * kind, otherwise the variable that is set does
 * @returns the signer, or undefined when none is set
 */
export const getHostSigner = (
    env: CartesiEnvironmentVariables = getCartesiEnvironmentVariables(),
): HostSigner | undefined => {
    const {
        CARTESI_AUTH_KIND: kind,
        CARTESI_AUTH_MNEMONIC: mnemonic,
        CARTESI_AUTH_PRIVATE_KEY: privateKey,
    } = env;

    if (!kind && !mnemonic && !privateKey) {
        return undefined;
    }
    if (!kind && mnemonic && privateKey) {
        throw new Error(
            "Both CARTESI_AUTH_MNEMONIC and CARTESI_AUTH_PRIVATE_KEY are set, set CARTESI_AUTH_KIND to mnemonic or private_key to choose",
        );
    }

    const resolvedKind = kind ?? (mnemonic ? "mnemonic" : "private_key");
    switch (resolvedKind) {
        case "mnemonic":
            if (!mnemonic) {
                throw new Error(
                    "CARTESI_AUTH_KIND is mnemonic, but CARTESI_AUTH_MNEMONIC is not set",
                );
            }
            return { kind: "mnemonic", mnemonic };
        case "private_key":
            if (!privateKey || !isHex(privateKey)) {
                throw new Error(
                    "CARTESI_AUTH_KIND is private_key, but CARTESI_AUTH_PRIVATE_KEY is not a 0x-prefixed private key",
                );
            }
            return { kind: "private_key", privateKey };
        default:
            throw new Error(
                `CARTESI_AUTH_KIND ${resolvedKind} isn't supported to foreclose, use mnemonic or private_key`,
            );
    }
};

/**
 * Work out how to sign as the guardian, the only account allowed to
 * foreclose. A signer given for the command takes precedence over the node's.
 * cartesi-rollups-cli signs with whatever its environment configures, so for
 * a mnemonic the guardian's account index is looked up, unless one is given.
 * A private key has no index to choose.
 * @returns the account index and environment to sign with, and a warning to show, if any
 */
export const resolveForecloseSigner = (options: {
    accountIndex?: number;
    guardian: Address;
    host?: HostSigner;
    node?: NodeSigner;
}): {
    accountIndex?: number;
    env?: Record<string, string>;
    warning?: string;
} => {
    const { accountIndex, guardian, host, node } = options;

    if (isAddressEqual(guardian, zeroAddress)) {
        throw new Error(
            "The application was deployed without a withdrawal config and cannot be foreclosed",
        );
    }

    const ignoredIndex =
        accountIndex === undefined
            ? {}
            : {
                  warning:
                      "--account-index is ignored when signing with a private key",
              };

    if (host?.kind === "private_key") {
        const { address } = privateKeyToAccount(host.privateKey);
        if (!isAddressEqual(address, guardian)) {
            throw new Error(
                `The private key's address ${address} isn't the guardian ${guardian}`,
            );
        }
        return {
            ...ignoredIndex,
            env: {
                CARTESI_AUTH_KIND: "private_key",
                CARTESI_AUTH_PRIVATE_KEY: host.privateKey,
            },
        };
    }

    // the node's private key is never read, so it can't be checked here
    const signer = host ?? node;
    if (!signer) {
        throw new Error("No signer to foreclose with");
    }
    if (signer.kind === "private_key") {
        return ignoredIndex;
    }

    const env = host
        ? {
              CARTESI_AUTH_KIND: "mnemonic",
              CARTESI_AUTH_MNEMONIC: host.mnemonic,
          }
        : undefined;
    if (accountIndex !== undefined) {
        return { accountIndex, env };
    }

    const index = findMnemonicAccountIndex({
        address: guardian,
        mnemonic: signer.mnemonic,
    });
    if (index === undefined) {
        throw new Error(
            `Guardian ${guardian} isn't one of the first 20 accounts of the mnemonic in use. If it belongs to another mnemonic, set CARTESI_AUTH_MNEMONIC; if its index is higher, pass --account-index; if it's a raw private key, set CARTESI_AUTH_PRIVATE_KEY`,
        );
    }
    return { accountIndex: index, env };
};

export const createForecloseCommand = () => {
    return new Command("foreclose")
        .description(
            "Forecloses the application, so users can withdraw their funds",
        )
        .addHelpText(
            "after",
            `
Signs as the application guardian. By default it uses the rollups node signer, looking up the guardian in its mnemonic.
For a guardian outside it, set the signer for this command only:
  CARTESI_AUTH_MNEMONIC="<mnemonic>" cartesi foreclose
  CARTESI_AUTH_PRIVATE_KEY=<0x-private-key> cartesi foreclose
Set CARTESI_AUTH_KIND to mnemonic or private_key when both are set.`,
        )
        .configureHelp({ showGlobalOptions: true })
        .option("--application <address>", "application address")
        .option(
            "--project-name <string>",
            "name of project (used by docker compose and cartesi-rollups-node)",
        )
        .addOption(
            new Option(
                "--account-index <index>",
                "index of the guardian in the mnemonic (default: looked up from the application guardian; ignored for private-key signers)",
            ).argParser(parseAccountIndex),
        )
        .option("-y, --yes", "skip the confirmation prompt")
        .option("--json", "print the result as JSON")
        .option(
            "--no-wait",
            "return after broadcast without waiting for the receipt",
        )
        .option(
            "--wait-timeout <duration>",
            "maximum time to wait for the receipt (e.g. 30s, 5m)",
        )
        .action(async (options) => {
            const projectName = getProjectName(options);
            const application = await resolveNodeApplication({
                application: options.application,
                projectName,
            });

            const client = await getNodeClient({ projectName });
            const { withdrawalConfig } = await client.getApplication({
                application,
            });
            // the node signer is only needed without a signer for the command
            const host = getHostSigner();
            const { accountIndex, env, warning } = resolveForecloseSigner({
                accountIndex: options.accountIndex,
                guardian: withdrawalConfig.guardian,
                host,
                node: host ? undefined : await getNodeSigner({ projectName }),
            });
            if (warning) {
                console.warn(chalk.yellow(warning));
            }

            try {
                await runNodeCommand({
                    accountIndex,
                    command: [
                        "cartesi-rollups-cli",
                        "foreclose",
                        application,
                        ...transactionArgs(options),
                    ],
                    env,
                    projectName,
                });
            } catch (error: unknown) {
                handleNodeCommandError(error);
            }
        });
};
