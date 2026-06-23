import {
    createPublicClient,
    http,
    zeroAddress,
    zeroHash,
    type Abi,
    type Address,
    type ReadContractParameters,
} from "viem";
import {
    daveAppFactoryAbi,
    daveAppFactoryAddress,
    erc1155BatchPortalConfig,
    erc1155SinglePortalConfig,
    erc20PortalConfig,
    erc721PortalConfig,
    etherPortalConfig,
    inputBoxConfig,
} from "./contracts";
import ForkChainValidationError from "./errors/ForkChainValidationError";
import UnsupportedForkChainError from "./errors/UnsupportedForkChainError";
import type { ForkConfig } from "./types/chain";

interface AssertForkConfigOptions {
    includePRT?: boolean;
}

interface ContractCheckersOptions extends AssertForkConfigOptions {
    chainId: number;
    blockNumber: bigint;
}

interface ContractCheckerConfig {
    name: string;
    getAddress: () => Address;
    abi: Abi;
    getReadContractParameters: () => ReadContractParameters<Abi>;
}

const getContractCheckers = (options: ContractCheckersOptions) => {
    const checkers: ContractCheckerConfig[] = [
        {
            name: "InputBox",
            getAddress() {
                return inputBoxConfig.address;
            },
            abi: inputBoxConfig.abi,
            getReadContractParameters(): ReadContractParameters<
                typeof inputBoxConfig.abi
            > {
                return {
                    address: this.getAddress(),
                    abi: inputBoxConfig.abi,
                    functionName: "getDeploymentBlockNumber",
                    args: [],
                    blockNumber: options.blockNumber,
                };
            },
        },
        {
            name: "EtherPortal",
            getAddress() {
                return etherPortalConfig.address;
            },
            abi: etherPortalConfig.abi,
            getReadContractParameters(): ReadContractParameters<
                typeof etherPortalConfig.abi
            > {
                return {
                    address: this.getAddress(),
                    abi: etherPortalConfig.abi,
                    functionName: "getInputBox",
                    args: [],
                    blockNumber: options.blockNumber,
                };
            },
        },
        {
            name: "ERC20Portal",
            getAddress() {
                return erc20PortalConfig.address;
            },
            abi: erc20PortalConfig.abi,
            getReadContractParameters(): ReadContractParameters<
                typeof erc20PortalConfig.abi
            > {
                return {
                    address: this.getAddress(),
                    abi: erc20PortalConfig.abi,
                    functionName: "getInputBox",
                    args: [],
                    blockNumber: options.blockNumber,
                };
            },
        },
        {
            name: "ERC721Portal",
            getAddress() {
                return erc721PortalConfig.address;
            },
            abi: erc721PortalConfig.abi,
            getReadContractParameters(): ReadContractParameters<
                typeof erc721PortalConfig.abi
            > {
                return {
                    address: this.getAddress(),
                    abi: erc721PortalConfig.abi,
                    functionName: "getInputBox",
                    args: [],
                    blockNumber: options.blockNumber,
                };
            },
        },
        {
            name: "ERC1155SinglePortal",
            getAddress() {
                return erc1155SinglePortalConfig.address;
            },
            abi: erc1155SinglePortalConfig.abi,
            getReadContractParameters(): ReadContractParameters<
                typeof erc1155SinglePortalConfig.abi
            > {
                return {
                    address: this.getAddress(),
                    abi: erc1155SinglePortalConfig.abi,
                    functionName: "getInputBox",
                    args: [],
                    blockNumber: options.blockNumber,
                };
            },
        },
        {
            name: "ERC1155BatchPortal",
            getAddress() {
                return erc1155BatchPortalConfig.address;
            },
            abi: erc1155BatchPortalConfig.abi,
            getReadContractParameters(): ReadContractParameters<
                typeof erc1155BatchPortalConfig.abi
            > {
                return {
                    address: this.getAddress(),
                    abi: erc1155BatchPortalConfig.abi,
                    functionName: "getInputBox",
                    args: [],
                    blockNumber: options.blockNumber,
                };
            },
        },
    ];

    if (options.includePRT) {
        checkers.push({
            name: "DaveAppFactory",
            getAddress() {
                const address =
                    daveAppFactoryAddress[
                        options.chainId as keyof typeof daveAppFactoryAddress
                    ];

                if (!address) {
                    throw new UnsupportedForkChainError(
                        options.chainId,
                        "DaveAppFactory address not found for this chain.",
                    );
                }

                return address;
            },
            abi: daveAppFactoryAbi,
            getReadContractParameters(): ReadContractParameters<
                typeof daveAppFactoryAbi
            > {
                return {
                    address: this.getAddress(),
                    abi: daveAppFactoryAbi,
                    functionName: "calculateDaveAppAddress",
                    args: [
                        zeroHash,
                        {
                            accountsDriveStartIndex: 0n,
                            guardian: zeroAddress,
                            log2LeavesPerAccount: 0,
                            log2MaxNumOfAccounts: 0,
                            withdrawalOutputBuilder: zeroAddress,
                        },
                        zeroHash,
                    ],
                    blockNumber: options.blockNumber,
                };
            },
        });
    }

    return checkers;
};

/**
 * Asserts that the provided fork configuration is valid by checking if the required contracts are deployed and
 * callable on the specified chain and block number.
 * If the fork configuration is invalid, an UnsupportedForkChainError is thrown with details
 * about the missing contracts or failed calls.
 * @param forkConfig - The fork configuration to validate.
 * @param options - Optional parameters to customize the validation behavior.
 * @returns A promise that resolves if the fork configuration is valid, or rejects with an UnsupportedForkChainError if invalid.
 */
export const assertForkConfig = async (
    forkConfig: ForkConfig,
    options?: AssertForkConfigOptions,
) => {
    const { chainId, url, blockNumber } = forkConfig;
    const client = createPublicClient({
        transport: http(url),
        batch: { multicall: true },
    });

    const forkBlockNumber = blockNumber ?? (await client.getBlockNumber());
    const checkers = getContractCheckers({
        chainId,
        blockNumber: forkBlockNumber,
        ...options,
    });

    const bytecodes = await Promise.allSettled(
        checkers.map((checker) => {
            return client.getCode({
                address: checker.getAddress(),
                blockNumber: forkBlockNumber,
            });
        }),
    );

    const errorMessages: string[] = [];

    bytecodes.forEach((result, index) => {
        if (result.status === "rejected") {
            const baseMessage = `Contract ${checkers[index].name} at address ${checkers[index].getAddress()} on chain ${chainId} at block ${forkBlockNumber} got a problem when fetching its bytecode\n`;
            const origMessage =
                result.reason.shortMessage ??
                result.reason.message ??
                "Unknown error";

            throw new ForkChainValidationError(
                chainId,
                `${baseMessage}Original error: ${origMessage}`,
            );
        } else {
            if (result.value === "0x" || result.value === undefined) {
                errorMessages.push(
                    `No deployment found at address ${checkers[index].getAddress()} for contract ${checkers[index].name} on chain ${chainId} at block ${forkBlockNumber}`,
                );
            }
        }
    });

    if (errorMessages.length > 0) {
        throw new UnsupportedForkChainError(chainId, errorMessages.join("\n"));
    }

    const results = await Promise.allSettled(
        checkers.map((checker) => {
            return client.readContract(checker.getReadContractParameters());
        }),
    );

    results.forEach((result, index) => {
        if (result.status === "rejected") {
            const origMessage =
                result.reason.shortMessage ??
                result.reason.message ??
                "Unknown error";
            errorMessages.push(
                `Contract ${checkers[index].name} at address ${checkers[index].getAddress()} on chain ${chainId} at block ${forkBlockNumber} got a problem when calling function ${checkers[index].getReadContractParameters().functionName}\nOriginal error: ${origMessage}`,
            );
        }
    });

    if (errorMessages.length > 0) {
        throw new UnsupportedForkChainError(chainId, errorMessages.join("\n"));
    }

    return true;
};
