import chalk from "chalk";
import {
    type Address,
    BaseError,
    ContractFunctionRevertedError,
    erc721Abi,
    type Hash,
} from "viem";
import {
    erc721PortalAbi,
    erc721PortalAddress,
    testNonFungibleTokenAbi,
    testNonFungibleTokenAddress,
} from "../../contracts.js";
import type { DevnetClient } from "../../wallet.js";
import { resolveConnection } from "../connection.js";
import {
    type Amount,
    applicationLabel,
    type DepositResult,
    depositSpinner,
    InsufficientBalanceError,
    parseAmount,
    type PortalDepositOptions,
    TokenNotFoundError,
} from "./common.js";

export type Erc721Token = {
    address: Address;
    name: string;
    symbol: string;
};

/**
 * Read the metadata of an ERC-721 token.
 * @param client client connected to the devnet
 * @param address address of the token contract
 * @returns name and symbol of the token
 */
export const readErc721Token = async (
    client: DevnetClient,
    address: Address,
): Promise<Erc721Token> => {
    const args = { abi: erc721Abi, address } as const;
    const symbol = await client.readContract({
        ...args,
        functionName: "symbol",
    });
    const name = await client.readContract({ ...args, functionName: "name" });
    return { address, name, symbol };
};

export type DepositErc721Options = PortalDepositOptions & {
    /** ID of the token to deposit. */
    tokenId: Amount;

    /**
     * Address of the ERC-721 token contract.
     * @default the test NFT deployed to the devnet
     */
    token?: Address;
};

export type DepositErc721Result = DepositResult & {
    /** ID of the token deposited. */
    tokenId: bigint;

    /** Token deposited. */
    token: Erc721Token;
};

/**
 * Deposit an ERC-721 token to an application running on a local environment.
 * The portal is approved to transfer the token, if it is not already.
 * @param options deposit options
 * @returns the deposit made, and the transaction that made it
 */
export const depositErc721 = async (
    options: DepositErc721Options,
): Promise<DepositErc721Result> => {
    const {
        baseLayerData = "0x",
        execLayerData = "0x",
        token: address = testNonFungibleTokenAddress,
    } = options;
    const { application, client, from } = await resolveConnection(options);

    const tokenId = parseAmount(options.tokenId, 0);
    const token = await readErc721Token(client, address);

    // the test NFT has a different abi, which allows minting
    const tokenAbi =
        token.address === testNonFungibleTokenAddress
            ? testNonFungibleTokenAbi
            : erc721Abi;

    // check ownership
    let currentOwner: Address;
    try {
        currentOwner = await client.readContract({
            abi: tokenAbi,
            address: token.address,
            args: [tokenId],
            functionName: "ownerOf",
        });
    } catch (e: unknown) {
        if (e instanceof BaseError) {
            const revertError = e.walk(
                (err) => err instanceof ContractFunctionRevertedError,
            );
            if (
                revertError instanceof ContractFunctionRevertedError &&
                revertError.data?.errorName === "ERC721NonexistentToken"
            ) {
                throw new TokenNotFoundError(`Token ${tokenId} does not exist`);
            }
            throw new Error("Failed to check ownership", { cause: e });
        }
        throw e;
    }

    if (currentOwner !== from) {
        throw new InsufficientBalanceError();
    }

    // check allowance
    const operator = await client.readContract({
        abi: tokenAbi,
        address: token.address,
        args: [tokenId],
        functionName: "getApproved",
    });

    // for messages
    const tokenLabel = `${chalk.cyan(tokenId)} ${token.symbol}`;
    const progress = depositSpinner(options);

    // approve if needed
    let approvalTransactionHash: Hash | undefined;
    if (operator !== erc721PortalAddress) {
        progress.start(`Approving ${tokenLabel}...`);
        const { request } = await client.simulateContract({
            abi: tokenAbi,
            account: from,
            address: token.address,
            functionName: "approve",
            args: [erc721PortalAddress, tokenId],
        });
        approvalTransactionHash = await client.writeContract(request);
        await client.waitForTransactionReceipt({
            hash: approvalTransactionHash,
        });
        progress.succeed(`Approved ${tokenLabel}`);
    }

    // simulate deposit call
    const { request } = await client.simulateContract({
        abi: erc721PortalAbi,
        account: from,
        address: erc721PortalAddress,
        functionName: "depositERC721Token",
        args: [
            token.address,
            application,
            tokenId,
            baseLayerData,
            execLayerData,
        ],
    });

    // send deposit
    progress.start(
        `Depositing ${tokenLabel} to ${applicationLabel(application)}...`,
    );
    const transactionHash = await client.writeContract(request);
    await client.waitForTransactionReceipt({ hash: transactionHash });
    progress.succeed(
        `Deposited ${tokenLabel} to ${applicationLabel(application)}`,
    );

    return {
        application,
        approvalTransactionHash,
        from,
        token,
        tokenId,
        transactionHash,
    };
};
