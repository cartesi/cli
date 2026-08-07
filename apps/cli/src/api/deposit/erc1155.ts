import chalk from "chalk";
import type { Address, Hash } from "viem";
import {
    erc1155BatchPortalAbi,
    erc1155BatchPortalAddress,
    erc1155SinglePortalAbi,
    erc1155SinglePortalAddress,
    testMultiTokenAbi,
    testMultiTokenAddress,
} from "../../contracts.js";
import type { DevnetClient } from "../../wallet.js";
import { resolveConnection } from "../connection.js";
import {
    type Amount,
    applicationLabel,
    type DepositResult,
    depositSpinner,
    InsufficientBalanceError,
    InvalidAmountError,
    parseAmount,
    type PortalDepositOptions,
} from "./common.js";

export type DepositErc1155Options = PortalDepositOptions & {
    /** ID of the token to deposit. */
    tokenId: Amount;

    /** Number of units of the token to deposit. */
    amount: Amount;

    /**
     * Address of the ERC-1155 token contract.
     * @default the test multi token deployed to the devnet
     */
    token?: Address;
};

export type DepositErc1155Result = DepositResult & {
    /** ID of the token deposited. */
    tokenId: bigint;

    /** Number of units deposited. */
    amount: bigint;

    /** Address of the token contract. */
    token: Address;
};

export type DepositErc1155BatchOptions = PortalDepositOptions & {
    /** IDs of the tokens to deposit. */
    tokenIds: Amount[];

    /** Number of units of each token to deposit, in the same order. */
    amounts: Amount[];

    /**
     * Address of the ERC-1155 token contract.
     * @default the test multi token deployed to the devnet
     */
    token?: Address;
};

export type DepositErc1155BatchResult = DepositResult & {
    /** IDs of the tokens deposited. */
    tokenIds: bigint[];

    /** Number of units deposited of each token, in the same order. */
    amounts: bigint[];

    /** Address of the token contract. */
    token: Address;
};

/**
 * Deposit units of a single ERC-1155 token to an application running on a local
 * environment. The portal is approved to transfer the tokens, if it is not
 * already.
 * @param options deposit options
 * @returns the deposit made, and the transaction that made it
 */
export const depositErc1155 = async (
    options: DepositErc1155Options,
): Promise<DepositErc1155Result> => {
    const {
        baseLayerData = "0x",
        execLayerData = "0x",
        token = testMultiTokenAddress,
    } = options;
    const { application, client, from } = await resolveConnection(options);

    const tokenId = parseAmount(options.tokenId, 0);
    const amount = parseAmount(options.amount, 0);

    // ensure amount is positive
    if (amount <= 0n) {
        throw new InvalidAmountError(
            "Amount of tokens to be deposited, must be greater than zero.",
        );
    }

    // check balance
    const balance = await client.readContract({
        abi: testMultiTokenAbi,
        address: token,
        functionName: "balanceOf",
        args: [from, tokenId],
    });
    if (balance < amount) {
        throw new InsufficientBalanceError();
    }

    const progress = depositSpinner(options);

    // approve the portal, if needed
    const approvalTransactionHash = await approvePortal({
        client,
        from,
        portal: erc1155SinglePortalAddress,
        progress,
        token,
    });

    // simulate deposit call
    const { request } = await client.simulateContract({
        abi: erc1155SinglePortalAbi,
        account: from,
        address: erc1155SinglePortalAddress,
        functionName: "depositSingleERC1155Token",
        args: [
            token,
            application,
            tokenId,
            amount,
            baseLayerData,
            execLayerData,
        ],
    });

    // for messages
    const amountLabel = `${chalk.cyan(amount)} units of token id ${tokenId}`;

    // send deposit
    progress.start(
        `Depositing ${amountLabel} to ${applicationLabel(application)}...`,
    );
    const transactionHash = await client.writeContract(request);
    await client.waitForTransactionReceipt({ hash: transactionHash });
    progress.succeed(
        `Deposited ${amountLabel} to ${applicationLabel(application)}`,
    );

    return {
        amount,
        application,
        approvalTransactionHash,
        from,
        token,
        tokenId,
        transactionHash,
    };
};

/**
 * Deposit units of several ERC-1155 tokens to an application running on a local
 * environment, in a single transaction. The portal is approved to transfer the
 * tokens, if it is not already.
 * @param options deposit options
 * @returns the deposit made, and the transaction that made it
 */
export const depositErc1155Batch = async (
    options: DepositErc1155BatchOptions,
): Promise<DepositErc1155BatchResult> => {
    const {
        baseLayerData = "0x",
        execLayerData = "0x",
        token = testMultiTokenAddress,
    } = options;
    const { application, client, from } = await resolveConnection(options);

    const tokenIds = options.tokenIds.map((tokenId) => parseAmount(tokenId, 0));
    const amounts = options.amounts.map((amount) => parseAmount(amount, 0));

    if (tokenIds.length !== amounts.length) {
        throw new InvalidAmountError(
            "Token IDs and amounts must have the same length.",
        );
    }

    for (const [index, amount] of amounts.entries()) {
        if (amount <= 0n) {
            throw new InvalidAmountError(
                `Amount of token Id: ${tokenIds[index]} to be deposited, must be greater than zero.`,
            );
        }
    }

    // check balances
    for (const [index, tokenId] of tokenIds.entries()) {
        const balance = await client.readContract({
            abi: testMultiTokenAbi,
            address: token,
            functionName: "balanceOf",
            args: [from, tokenId],
        });
        if (balance < amounts[index]) {
            throw new InsufficientBalanceError(
                `Insufficient balance for token ID ${tokenId}`,
            );
        }
    }

    const progress = depositSpinner(options);

    // approve the portal, if needed
    const approvalTransactionHash = await approvePortal({
        client,
        from,
        portal: erc1155BatchPortalAddress,
        progress,
        token,
    });

    // simulate batch deposit call
    const { request } = await client.simulateContract({
        abi: erc1155BatchPortalAbi,
        account: from,
        address: erc1155BatchPortalAddress,
        functionName: "depositBatchERC1155Token",
        args: [
            token,
            application,
            tokenIds,
            amounts,
            baseLayerData,
            execLayerData,
        ],
    });

    // for messages
    const amountLabel = tokenIds
        .map(
            (tokenId, index) =>
                `${chalk.cyan(amounts[index])} units of token id ${tokenId}`,
        )
        .join(", ");

    // send deposit
    progress.start(`Depositing tokens to ${applicationLabel(application)}...`);
    const transactionHash = await client.writeContract(request);
    await client.waitForTransactionReceipt({ hash: transactionHash });
    progress.succeed(
        `Deposited ${amountLabel} to ${applicationLabel(application)}`,
    );

    return {
        amounts,
        application,
        approvalTransactionHash,
        from,
        token,
        tokenIds,
        transactionHash,
    };
};

/**
 * Approve a portal to transfer the tokens of the sender, if it is not approved
 * already.
 * @returns the hash of the approval transaction, if one was necessary
 */
const approvePortal = async (options: {
    client: DevnetClient;
    from: Address;
    portal: Address;
    progress: ReturnType<typeof depositSpinner>;
    token: Address;
}): Promise<Hash | undefined> => {
    const { client, from, portal, progress, token } = options;

    const isApproved = await client.readContract({
        abi: testMultiTokenAbi,
        address: token,
        functionName: "isApprovedForAll",
        args: [from, portal],
    });

    if (isApproved) {
        return undefined;
    }

    progress.start(`Approving ERC1155Portal...`);
    const { request } = await client.simulateContract({
        abi: testMultiTokenAbi,
        account: from,
        address: token,
        functionName: "setApprovalForAll",
        args: [portal, true],
    });
    const hash = await client.writeContract(request);
    await client.waitForTransactionReceipt({ hash });
    progress.succeed(`Approved ERC1155Portal`);
    return hash;
};
