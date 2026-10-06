import { ExecaError, execa } from "execa";

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
 * Build the docker arguments to run a command inside the rollups node
 * container. Without a terminal attached docker cannot allocate a TTY, so it
 * must be disabled.
 */
export const nodeExecArgs = (options: {
    accountIndex?: number;
    command: string[];
    env?: Record<string, string>;
    interactive: boolean;
    projectName: string;
    workdir?: string;
}): string[] => {
    const { accountIndex, command, env, interactive, projectName, workdir } =
        options;
    const args = ["compose", "--project-name", projectName, "exec"];
    if (!interactive) {
        args.push("-T");
    }
    // only the names: docker takes the values from its own environment, so
    // secrets never show up in the process arguments
    for (const name of Object.keys(env ?? {})) {
        args.push("-e", name);
    }
    if (accountIndex !== undefined) {
        args.push("-e", `CARTESI_AUTH_MNEMONIC_ACCOUNT_INDEX=${accountIndex}`);
    }
    if (workdir) {
        args.push("--workdir", workdir);
    }
    return [...args, "rollups_node", ...command];
};

/**
 * Run a command inside the rollups node container with the terminal attached,
 * so its prompts and output reach the user directly. Its output can be sent to
 * stderr to keep stdout for the output of a later command.
 */
export const runNodeCommand = (options: {
    accountIndex?: number;
    command: string[];
    env?: Record<string, string>;
    projectName: string;
    stdout?: "stdout" | "stderr";
}) =>
    execa(
        "docker",
        nodeExecArgs({ ...options, interactive: !!process.stdin.isTTY }),
        {
            env: options.env,
            stdin: "inherit",
            stdout: options.stdout === "stderr" ? 2 : "inherit",
            stderr: "inherit",
        },
    );

/**
 * Run a command inside the rollups node container and capture its output
 * @returns stdout of the command
 */
export const execNodeCommand = async (options: {
    command: string[];
    input?: string;
    projectName: string;
    workdir?: string;
}): Promise<string> => {
    const { input, ...rest } = options;
    try {
        const { stdout } = await execa(
            "docker",
            nodeExecArgs({ ...rest, interactive: false }),
            { input },
        );
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
 * Write content to a fresh temporary file inside the rollups node container,
 * so the node tools can read it
 * @returns path of the file inside the container
 */
export const writeNodeTempFile = async (options: {
    content: string;
    projectName: string;
}): Promise<string> => {
    const { content, projectName } = options;
    const stdout = await execNodeCommand({
        command: ["sh", "-c", 'f=$(mktemp) && cat > "$f" && echo "$f"'],
        input: content,
        projectName,
    });
    return stdout.trim();
};

/**
 * Remove a file or directory from the rollups node container
 */
export const removeNodePath = (options: {
    path: string;
    projectName: string;
}) =>
    execNodeCommand({
        command: ["rm", "-rf", options.path],
        projectName: options.projectName,
    });

/**
 * Check whether a path exists inside the rollups node container
 */
export const nodePathExists = async (options: {
    path: string;
    projectName: string;
}): Promise<boolean> => {
    const { exitCode } = await execa(
        "docker",
        nodeExecArgs({
            command: ["test", "-e", options.path],
            interactive: false,
            projectName: options.projectName,
        }),
        { reject: false },
    );
    return exitCode === 0;
};

/**
 * Report the failure of a command run with the terminal attached. The command
 * already printed its error, so only its exit code is propagated.
 */
export const handleNodeCommandError = (error: unknown) => {
    if (error instanceof ExecaError) {
        process.exitCode = error.exitCode ?? 1;
        return;
    }
    throw error;
};

/**
 * Signer the rollups node container is configured with. Private keys are never
 * read out of the container, only their kind.
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
 * Read the signer the rollups node container is configured with, which is
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
