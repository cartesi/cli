import fs from "node:fs";
import { isIPv6 } from "node:net";
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
} from "./contracts.js";
import type { CartesiEnvironmentVariables } from "./base.js";
import { nodeSecretFileVariables } from "./compose/node.js";
import ForkChainValidationError from "./errors/ForkChainValidationError.js";
import UnsupportedForkChainError from "./errors/UnsupportedForkChainError.js";
import type { ForkConfig } from "./types/chain.js";

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
                    functionName: "version",
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
                    functionName: "version",
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
                    functionName: "version",
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
                    functionName: "version",
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
                    functionName: "version",
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
                        0n,
                        zeroAddress,
                        [],
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

/**
 * Asserts that each key file the host names for the node is a readable file,
 * so a wrong path fails before any container starts. The error names the
 * variable and the path, never the file's content.
 */
export const assertSecretFiles = (env: CartesiEnvironmentVariables) => {
    for (const name of nodeSecretFileVariables) {
        const file = env[name];
        if (file === undefined) {
            continue;
        }
        try {
            if (!fs.statSync(file).isFile()) {
                throw new Error("not a file");
            }
            fs.accessSync(file, fs.constants.R_OK);
        } catch {
            throw new Error(`${name} must name a readable file: "${file}"`);
        }
    }
};

/** Whether every `%` in `value` starts a `%XX` escape. */
const hasValidEscapes = (value: string): boolean =>
    !/%(?![0-9A-Fa-f]{2})/.test(value);

/**
 * Whether `name` is a host name Go's `url.Parse` accepts: no character it
 * would have to escape, and `%XX` only for non-ASCII bytes or `%25`.
 */
const isValidHostName = (name: string): boolean => {
    for (let i = 0; i < name.length; i++) {
        const c = name[i];
        if (c === "%") {
            const hex = name.slice(i + 1, i + 3);
            if (!/^[0-9A-Fa-f]{2}$/.test(hex)) {
                return false;
            }
            if (Number.parseInt(hex[0], 16) < 8 && hex !== "25") {
                return false;
            }
            i += 2;
        } else if (
            c.charCodeAt(0) < 0x80 &&
            !/[A-Za-z0-9\-._~!$&'()*+,;="<>[\]]/.test(c)
        ) {
            return false;
        }
    }
    return true;
};

/** Whether `host` (`name[:port]` or `[ipv6][:port]`) has a non-empty name. */
const isValidHost = (host: string): boolean => {
    let name: string;
    let port: string;
    if (host.startsWith("[")) {
        const close = host.lastIndexOf("]");
        if (close < 0) {
            return false;
        }
        name = host.slice(1, close);
        port = host.slice(close + 1);
        // an IPv6 zone is escaped as %25, e.g. [fe80::1%25en0]
        const zoneAt = name.indexOf("%25");
        const address = zoneAt < 0 ? name : name.slice(0, zoneAt);
        if (!isIPv6(address) || !hasValidEscapes(name)) {
            return false;
        }
    } else {
        const colonAt = host.indexOf(":");
        if (colonAt !== host.lastIndexOf(":")) {
            return false;
        }
        name = colonAt < 0 ? host : host.slice(0, colonAt);
        port = colonAt < 0 ? "" : host.slice(colonAt);
        if (!isValidHostName(name)) {
            return false;
        }
    }
    return name !== "" && /^(:[0-9]*)?$/.test(port);
};

/**
 * Whether `raw` is an endpoint the rollups-node accepts: Go's `url.Parse`
 * succeeds on it, its scheme is http or https and it has a host name. Mirrors
 * Go rather than WHATWG `URL`, which accepts and rejects other URLs.
 */
export const isValidHttpEndpoint = (raw: string): boolean => {
    // Go rejects control characters; surrounding whitespace is a mistake
    const isControl = (c: string) => c < " " || c === "\x7f";
    if (raw !== raw.trim() || [...raw].some(isControl)) {
        return false;
    }
    const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(raw);
    if (!scheme || !["http", "https"].includes(scheme[1].toLowerCase())) {
        return false;
    }
    let rest = raw.slice(scheme[0].length);

    // Go checks the escapes of the fragment, but not the query
    const hashAt = rest.indexOf("#");
    if (hashAt >= 0) {
        if (!hasValidEscapes(rest.slice(hashAt + 1))) {
            return false;
        }
        rest = rest.slice(0, hashAt);
    }
    const queryAt = rest.indexOf("?");
    if (queryAt >= 0) {
        rest = rest.slice(0, queryAt);
    }

    // without //, the URL has no authority and so no host
    if (!rest.startsWith("//")) {
        return false;
    }
    rest = rest.slice(2);
    const slashAt = rest.indexOf("/");
    const authority = slashAt < 0 ? rest : rest.slice(0, slashAt);
    const path = slashAt < 0 ? "" : rest.slice(slashAt);
    if (!hasValidEscapes(path)) {
        return false;
    }

    const atAt = authority.lastIndexOf("@");
    const userinfo = atAt < 0 ? "" : authority.slice(0, atAt);
    if (
        !/^[A-Za-z0-9\-._:~!$&'()*+,;=%@]*$/.test(userinfo) ||
        !hasValidEscapes(userinfo)
    ) {
        return false;
    }
    return isValidHost(authority.slice(atAt + 1));
};

/**
 * Asserts that a blockchain endpoint set on the host is one the rollups-node
 * accepts, so a wrong one fails before any container starts. The error never
 * shows the value, which may hold credentials.
 */
export const assertBlockchainEndpoint = (env: CartesiEnvironmentVariables) => {
    const endpoint = env.CARTESI_BLOCKCHAIN_HTTP_ENDPOINT;
    if (endpoint !== undefined && !isValidHttpEndpoint(endpoint)) {
        throw new Error(
            "CARTESI_BLOCKCHAIN_HTTP_ENDPOINT must be an http(s) URL with a DNS name or IP address (redirects are not followed)",
        );
    }
};
