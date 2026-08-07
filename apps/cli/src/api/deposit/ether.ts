import chalk from "chalk";
import { formatUnits } from "viem";
import { etherPortalAbi, etherPortalAddress } from "../../contracts.js";
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

export type DepositEtherOptions = DepositOptions & {
    /** Amount to deposit, in wei, or in ETH when given as a string. */
    amount: Amount;
};

export type DepositEtherResult = DepositResult & {
    /** Amount deposited, in wei. */
    amount: bigint;
};

/**
 * Deposit ether to an application running on a local environment.
 * @param options deposit options
 * @returns the deposit made, and the transaction that made it
 */
export const depositEther = async (
    options: DepositEtherOptions,
): Promise<DepositEtherResult> => {
    const { execLayerData = "0x" } = options;
    const { application, client, from } = await resolveConnection(options);

    const { decimals, symbol } = client.chain.nativeCurrency;
    const amount = parseAmount(options.amount, decimals);

    // check balance
    const balance = await client.getBalance({ address: from });
    if (balance < amount) {
        throw new InsufficientBalanceError();
    }

    const { request } = await client.simulateContract({
        abi: etherPortalAbi,
        account: from,
        address: etherPortalAddress,
        args: [application, execLayerData],
        functionName: "depositEther",
        value: amount,
    });

    // for messages
    const amountLabel = `${chalk.cyan(formatUnits(amount, decimals))} ${symbol}`;

    // send deposit
    const progress = depositSpinner(options);
    progress.start(
        `Depositing ${amountLabel} to ${applicationLabel(application)}...`,
    );
    const transactionHash = await client.writeContract(request);
    await client.waitForTransactionReceipt({ hash: transactionHash });
    progress.succeed(
        `Deposited ${amountLabel} to ${applicationLabel(application)}`,
    );

    return { amount, application, from, transactionHash };
};
