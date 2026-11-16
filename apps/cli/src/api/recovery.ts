import type { Address } from "viem";
import {
    execNodeCommand,
    runAttachedNodeCommand,
    type TransactionOptions,
    transactionArgs,
} from "../exec/node-container.js";
import type { ProgressOptions } from "./types.js";

export { NodeCommandError } from "../exec/node-container.js";

/**
 * Options shared by the fund recovery functions, `foreclose`, `refund` and
 * `withdraw`, which send their transaction with cartesi-rollups-cli inside
 * the rollups node container.
 */
export type RecoveryOptions = ProgressOptions & {
    /**
     * Address of the application.
     * @default the application deployed for the current machine
     */
    application?: string;

    /**
     * Name of the project (used by docker compose and cartesi-rollups-node).
     * @default basename of the current working directory
     */
    projectName?: string;

    /** Index of the signer account in the node mnemonic. */
    accountIndex?: number;

    /**
     * Wait for the transaction receipt.
     * @default true
     */
    wait?: boolean;

    /** Maximum time to wait for the receipt (e.g. 30s, 5m). */
    waitTimeout?: string;

    /**
     * Attach cartesi-rollups-cli to the terminal, so it asks for confirmation
     * and prints its own output, which is not returned. A failure it printed
     * is thrown as a NodeCommandError, with its exit code. Without it nothing
     * is asked, and the output is returned.
     * @default false
     */
    stream?: boolean;

    /**
     * Skip the confirmation of cartesi-rollups-cli. Only with `stream`, as
     * nothing is asked without it.
     */
    yes?: boolean;

    /**
     * Have cartesi-rollups-cli print its output as JSON. Only with `stream`,
     * as the output is always read as JSON without it.
     */
    json?: boolean;
};

export type RecoveryResult = {
    /** Address of the application. */
    application: Address;

    /**
     * Output of cartesi-rollups-cli, as it prints it with `--json`. Undefined
     * with `stream`, as it is printed instead.
     */
    output?: Record<string, unknown>;
};

/**
 * Run a cartesi-rollups-cli command that sends a transaction. With `stream`,
 * it is attached to the terminal with the transaction options as given.
 * Otherwise it runs with `--yes` and `--json`, and its output is returned.
 * @returns the output of the command, undefined with `stream`
 */
export const runRecoveryCommand = async (options: {
    accountIndex?: number;
    command: string[];
    env?: Record<string, string>;
    projectName: string;
    stream: boolean;
    tx: TransactionOptions;
}): Promise<Record<string, unknown> | undefined> => {
    const { accountIndex, command, env, projectName, stream, tx } = options;
    if (stream) {
        await runAttachedNodeCommand({
            accountIndex,
            command: [...command, ...transactionArgs(tx)],
            env,
            projectName,
        });
        return undefined;
    }

    const stdout = await execNodeCommand({
        accountIndex,
        command: [
            ...command,
            ...transactionArgs({ ...tx, json: true, yes: true }),
        ],
        env,
        projectName,
    });
    return JSON.parse(stdout);
};
