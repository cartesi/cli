import chalk from "chalk";
import { type Address, erc20Abi, formatUnits } from "viem";
import {
    erc20PortalAbi,
    erc20PortalAddress,
    testFungibleTokenAddress,
} from "../../contracts.js";
import type { DevnetClient } from "../../wallet.js";
import { resolveConnection } from "../connection.js";
import {
    type Amount,
    applicationLabel,
    type DepositOptions,
    type DepositResult,
    depositSpinner,
    InsufficientBalanceError,
    parseAmount,
} from "./common.js";

export type Erc20Token = {
    address: Address;
    name: string;
    symbol: string;
    decimals: number;
};

/**
 * Read the metadata of an ERC-20 token.
 * @param client client connected to the devnet
 * @param address address of the token contract
 * @returns name, symbol and decimals of the token
 */
export const readErc20Token = async (
    client: DevnetClient,
    address: Address,
): Promise<Erc20Token> => {
    const args = { abi: erc20Abi, address } as const;
    const symbol = await client.readContract({
        ...args,
        functionName: "symbol",
    });
    const name = await client.readContract({ ...args, functionName: "name" });
    const decimals = await client.readContract({
        ...args,
        functionName: "decimals",
    });
    return { address, name, symbol, decimals };
};

export type DepositErc20Options = DepositOptions & {
    /**
     * Amount to deposit, in the base unit of the token, or in its display unit
     * when given as a string.
     */
    amount: Amount;

    /**
     * Address of the ERC-20 token contract.
     * @default the test token deployed to the devnet
     */
    token?: Address;
};

export type DepositErc20Result = DepositResult & {
    /** Amount deposited, in the base unit of the token. */
    amount: bigint;

    /** Token deposited. */
    token: Erc20Token;
};

/**
 * Deposit ERC-20 tokens to an application running on a local environment. The
 * portal is approved to transfer the tokens, if it is not already.
 * @param options deposit options
 * @returns the deposit made, and the transaction that made it
 */
export const depositErc20 = async (
    options: DepositErc20Options,
): Promise<DepositErc20Result> => {
    const { execLayerData = "0x", token: address = testFungibleTokenAddress } =
        options;
    const { application, client, from } = await resolveConnection(options);

    const token = await readErc20Token(client, address);
    const { decimals, symbol } = token;
    const amount = parseAmount(options.amount, decimals);

    // check balance
    const balance = await client.readContract({
        abi: erc20Abi,
        address: token.address,
        functionName: "balanceOf",
        args: [from],
    });
    if (balance < amount) {
        throw new InsufficientBalanceError();
    }

    // check allowance
    const allowance = await client.readContract({
        abi: erc20Abi,
        address: token.address,
        functionName: "allowance",
        args: [from, erc20PortalAddress],
    });

    // for messages
    const amountLabel = `${chalk.cyan(formatUnits(amount, decimals))} ${symbol}`;
    const progress = depositSpinner(options);

    // approve if needed
    let approvalTransactionHash: `0x${string}` | undefined;
    if (allowance < amount) {
        progress.start(`Approving ${amountLabel}...`);
        const { request } = await client.simulateContract({
            abi: erc20Abi,
            account: from,
            address: token.address,
            functionName: "approve",
            args: [erc20PortalAddress, amount],
        });
        approvalTransactionHash = await client.writeContract(request);
        await client.waitForTransactionReceipt({
            hash: approvalTransactionHash,
        });
        progress.succeed(`Approved ${amountLabel}`);
    }

    // simulate deposit call
    const { request } = await client.simulateContract({
        abi: erc20PortalAbi,
        account: from,
        address: erc20PortalAddress,
        functionName: "depositERC20Tokens",
        args: [token.address, application, amount, execLayerData],
    });

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
        transactionHash,
    };
};
