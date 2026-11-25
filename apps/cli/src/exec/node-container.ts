import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ExecaError, execa } from "execa";
import { type Hex, isHex } from "viem";
import type { CartesiEnvironmentVariables } from "../base.js";
import { baseEnvironment } from "../host/process.js";
import { type EnvironmentState, requireState } from "../host/state.js";

/**
 * Transaction options shared by the cartesi-rollups-cli commands that send a
 * transaction. Each one is forwarded only when set.
 */
export type TransactionOptions = {
    json?: boolean;
    wait?: boolean;
    waitTimeout?: string;
    yes?: boolean;
};

export const transactionArgs = (options: TransactionOptions): string[] => {
    const { json, wait, waitTimeout, yes } = options;
    const args: string[] = [];
    if (yes) {
        args.push("--yes");
    }
    if (json) {
        args.push("--json");
    }
    if (wait === false) {
        args.push("--no-wait");
    }
    if (waitTimeout) {
        args.push("--wait-timeout", waitTimeout);
    }
    return args;
};

/**
 * How a command runs as it did inside the rollups node container: on the
 * host, with the environment of the node, so `cartesi-rollups-cli` reaches its
 * database and chain. Commands run from the environment directory, unless
 * told otherwise.
 */
export const nodeExecOptions = (options: {
    accountIndex?: number;
    command: string[];
    env?: Record<string, string>;
    state: Pick<EnvironmentState, "dir" | "nodeEnv">;
    workdir?: string;
}): {
    file: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
} => {
    const { accountIndex, command, env, state, workdir } = options;
    const [file = "true", ...args] = command;
    return {
        args,
        cwd: workdir ?? state.dir,
        env: {
            ...baseEnvironment(),
            ...state.nodeEnv,
            ...env,
            ...(accountIndex !== undefined && {
                CARTESI_AUTH_MNEMONIC_ACCOUNT_INDEX: accountIndex.toString(),
            }),
        },
        file,
    };
};

const execOptions = (
    options: Omit<Parameters<typeof nodeExecOptions>[0], "state"> & {
        projectName: string;
    },
) => nodeExecOptions({ ...options, state: requireState(options.projectName) });

/**
 * Run a command with the environment of the rollups node, with the terminal
 * attached, so its prompts and output reach the user directly. Its output can
 * be sent to stderr to keep stdout for the output of a later command.
 */
export const runNodeCommand = (options: {
    accountIndex?: number;
    command: string[];
    env?: Record<string, string>;
    projectName: string;
    stdout?: "stdout" | "stderr";
}) => {
    const { args, cwd, env, file } = execOptions(options);
    return execa(file, args, {
        cwd,
        env,
        extendEnv: false,
        stdin: "inherit",
        stdout: options.stdout === "stderr" ? 2 : "inherit",
        stderr: "inherit",
    });
};

/**
 * Run a command with the environment of the rollups node and capture its
 * output
 * @returns stdout of the command
 */
export const execNodeCommand = async (options: {
    accountIndex?: number;
    command: string[];
    env?: Record<string, string>;
    input?: string;
    projectName: string;
    workdir?: string;
}): Promise<string> => {
    const { input, ...rest } = options;
    const { args, cwd, env, file } = execOptions(rest);
    try {
        const { stdout } = await execa(file, args, {
            cwd,
            env,
            extendEnv: false,
            input,
        });
        return stdout;
    } catch (error: unknown) {
        if (error instanceof ExecaError) {
            throw new Error(
                String(error.stderr ?? "").trim() || error.shortMessage,
            );
        }
        throw error;
    }
};

/**
 * Directories of the environment of a project the node tools work with: the
 * machine template the application is deployed from, and where withdrawals
 * replay machines and keep their proofs.
 */
export const getNodePaths = async (options: {
    projectName: string;
}): Promise<{ template: string; work: string }> => {
    const state = requireState(options.projectName);
    return { template: state.templatePath, work: state.workDir };
};

/**
 * Write content to a fresh file of the environment, so the node tools can
 * read it, and only the user can
 * @returns path of the file
 */
export const writeNodeTempFile = async (options: {
    content: string;
    projectName: string;
}): Promise<string> => {
    const { content, projectName } = options;
    const state = requireState(projectName);
    const file = path.join(state.dir, `tmp-${randomBytes(8).toString("hex")}`);
    fs.writeFileSync(file, content, { flag: "wx", mode: 0o600 });
    return file;
};

/**
 * Remove a file or directory of the environment
 */
export const removeNodePath = async (options: {
    path: string;
    projectName: string;
}) => {
    fs.rmSync(options.path, { force: true, recursive: true });
};

/**
 * Check whether a path of the environment exists
 */
export const nodePathExists = async (options: {
    path: string;
    projectName: string;
}): Promise<boolean> => fs.existsSync(options.path);

/**
 * A command run with the terminal attached failed. It already printed its
 * error to the terminal, so only its exit code is kept.
 */
export class NodeCommandError extends Error {
    readonly exitCode: number;

    constructor(exitCode: number, options?: ErrorOptions) {
        super(`The node command failed with exit code ${exitCode}`, options);
        this.name = "NodeCommandError";
        this.exitCode = exitCode;
    }
}

/**
 * Run a command with the environment of the rollups node, with the terminal
 * attached, like `runNodeCommand`, failing with a NodeCommandError when it exits with an
 * error it already printed
 */
export const runAttachedNodeCommand = async (
    options: Parameters<typeof runNodeCommand>[0],
) => {
    try {
        await runNodeCommand(options);
    } catch (error: unknown) {
        if (error instanceof ExecaError) {
            throw new NodeCommandError(error.exitCode ?? 1, { cause: error });
        }
        throw error;
    }
};

/**
 * Report the failure of a command run with the terminal attached. The command
 * already printed its error, so only its exit code is propagated. Any other
 * error is thrown, to be printed.
 */
export const handleNodeCommandError = (error: unknown) => {
    if (error instanceof NodeCommandError) {
        process.exitCode = error.exitCode;
        return;
    }
    throw error;
};

/**
 * Signer the rollups node is configured with. Private keys are never read out
 * of its environment, only their kind.
 */
export type NodeSigner =
    | { kind: "mnemonic"; mnemonic: string }
    | { kind: "private_key" };

/**
 * Print the signer kind and, for mnemonic signers, the mnemonic itself, the
 * same way cartesi-rollups-cli resolves them: an inline mnemonic takes
 * precedence over the one in CARTESI_AUTH_MNEMONIC_FILE.
 */
export const NODE_SIGNER_SCRIPT = `kind="\${CARTESI_AUTH_KIND:-mnemonic}"
printf '%s\\n' "$kind"
case "$kind" in
mnemonic|mnemonic_file)
    if [ -n "$CARTESI_AUTH_MNEMONIC" ]; then
        printf '%s\\n' "$CARTESI_AUTH_MNEMONIC"
    elif [ -n "$CARTESI_AUTH_MNEMONIC_FILE" ]; then
        cat "$CARTESI_AUTH_MNEMONIC_FILE"
    fi
    ;;
esac`;

/**
 * Parse the output of the node signer script
 */
export const parseNodeSigner = (stdout: string): NodeSigner => {
    const [kind = "", ...rest] = stdout.trim().split("\n");
    switch (kind.trim()) {
        case "mnemonic":
        case "mnemonic_file": {
            const mnemonic = rest.join(" ").trim();
            if (!mnemonic) {
                throw new Error("The rollups node has no mnemonic configured");
            }
            return { kind: "mnemonic", mnemonic };
        }
        case "private_key":
        case "private_key_file":
            return { kind: "private_key" };
        default:
            throw new Error(
                `Signer kind ${kind.trim()} of the rollups node isn't supported by the CLI`,
            );
    }
};

/**
 * Read the signer the rollups node is configured with, which is
 * the one cartesi-rollups-cli signs with unless a command overrides it
 */
export const getNodeSigner = async (options: {
    projectName: string;
}): Promise<NodeSigner> => {
    const stdout = await execNodeCommand({
        command: ["sh", "-c", NODE_SIGNER_SCRIPT],
        projectName: options.projectName,
    });
    return parseNodeSigner(stdout);
};

/**
 * Signer given for a single command, in the environment of the shell that
 * runs it, so it can sign as an account the node doesn't sign with
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
    env: CartesiEnvironmentVariables,
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
                `CARTESI_AUTH_KIND ${resolvedKind} isn't supported for a single command, use mnemonic or private_key`,
            );
    }
};

/**
 * Environment that makes cartesi-rollups-cli sign with the given signer
 */
export const hostSignerEnv = (signer: HostSigner): Record<string, string> =>
    signer.kind === "private_key"
        ? {
              CARTESI_AUTH_KIND: "private_key",
              CARTESI_AUTH_PRIVATE_KEY: signer.privateKey,
          }
        : {
              CARTESI_AUTH_KIND: "mnemonic",
              CARTESI_AUTH_MNEMONIC: signer.mnemonic,
          };
