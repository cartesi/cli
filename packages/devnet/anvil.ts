import pRetry from "p-retry";

/**
 * Get the installed anvil version
 * @returns the installed anvil version
 */
export const version = async () => {
    const proc = Bun.spawn(["anvil", "--version"]);
    const output = await proc.stdout.text();

    // anvil Version: 1.4.3-v1.4.3
    // Commit SHA: fa9f934bdac4bcf57e694e852a61997dda90668a
    // Build Timestamp: 2025-10-22T04:37:38.758664000Z (1761107858)
    // Build Profile: maxperf

    // parse the output to get the version
    const versionMatch = output.match(
        /Version: (\d+\.\d+\.\d+)-v(\d+\.\d+\.\d+)/,
    );
    if (!versionMatch) {
        throw new Error("Failed to parse anvil version. Is anvil installed?");
    }
    return versionMatch[1];
};

type StartOptions = {
    chainId?: number;
    loadState: string;
    dumpState: string;
};

/**
 * Start an anvil instance
 * @param options - The options for starting anvil
 * @returns The child process of the anvil instance
 */
export const start = async (options: StartOptions) => {
    const chainId = options.chainId ?? 31337;
    // spawn anvil child process
    const controller = new AbortController();
    const proc = Bun.spawn(
        [
            "anvil",
            "--load-state",
            options.loadState,
            "--preserve-historical-states",
            "--quiet",
            "--dump-state",
            options.dumpState,
        ],
        { signal: controller.signal, stdout: "inherit", stderr: "inherit" },
    );
    process.on("SIGINT", () => controller.abort());
    process.on("SIGTERM", () => controller.abort());

    // wait for anvil to be responding
    await pRetry(
        async () => {
            const cid = Bun.spawnSync(["cast", "chain-id"])
                .stdout.toString()
                .trim();
            if (cid !== chainId.toString()) {
                throw new Error("Anvil is not responding");
            }
            return cid;
        },
        { retries: 10, minTimeout: 100 },
    );

    return proc;
};

/**
 * Stop an anvil instance
 * @param proc - The child process of the anvil instance
 * @returns The exit code of the anvil instance
 */
export const stop = async (proc: Bun.Subprocess) => {
    // send a graceful shutdown signal
    proc.kill("SIGTERM");

    // check exit code
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
        throw new Error(`Anvil exited with code ${exitCode}`);
    }
    return exitCode;
};
