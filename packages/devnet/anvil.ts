import { $ } from "bun";
import pRetry from "p-retry";
import { SemVer } from "semver";

/**
 * Represents the output of the `anvil --version` command after parsing it into a structured format.
 * Type defined based on anvil version 1.4.3-v1.4.3 output.
 *
 * @example
 *  // anvil Version: 1.4.3-v1.4.3
 *  // Commit SHA: fa9f934bdac4bcf57e694e852a61997dda90668a
 *  // Build Timestamp: 2025-10-22T04:37:38.758664000Z (1761107858)
 *  // Build Profile: maxperf
 *
 */
type AnvilVersionStdout = {
    anvil_version: string;
    commit_sha: string;
    build_timestamp: string;
    build_profile: string;
};

type AnvilVersionStdoutKeys = keyof AnvilVersionStdout;

const normalizeAnvilVersionOutput = (output: string) => {
    return output.split("\n").reduce(
        (curr, next) => {
            const trimmedLine = next.trim();
            const firstColonIndex = trimmedLine.indexOf(":");

            if (firstColonIndex === -1) return curr;

            const prop = trimmedLine.slice(0, firstColonIndex);
            const value = trimmedLine.slice(firstColonIndex + 1);
            const key = prop
                .trim()
                .toLowerCase()
                .replace(/\s+/g, "_") as AnvilVersionStdoutKeys;

            if (key && value) {
                curr[key] = value.trim();
            }

            return curr;
        },
        {} as Partial<AnvilVersionStdout>,
    );
};

/**
 *  Get the clean version of an anvil version string.
 *  Anvil uses semver with a quirk by suffixing the version with tag-names e.g. 1.4.3-v1.4.3,
 *  so we need to parse it with semver and get the clean version.
 * @param anvilVersion
 * @returns
 */
const getCleanVersion = (anvilVersion: string) => {
    try {
        const semver = new SemVer(anvilVersion, { loose: true });
        return `${semver.major}.${semver.minor}.${semver.patch}`;
    } catch {
        // If the version is not a valid semver, return null
        return null;
    }
};

/**
 * Get the installed anvil version
 * @returns the installed anvil version
 */
export const version = async () => {
    const output = await $`anvil --version`.text();

    const data = normalizeAnvilVersionOutput(output);

    if (!data.anvil_version) {
        throw new Error("Failed to parse anvil version. Is anvil installed?");
    }

    const cleanVersion = getCleanVersion(data.anvil_version);

    if (!cleanVersion) {
        throw new Error(
            `Anvil version "${data.anvil_version}" is not a valid semver.`,
        );
    }

    return cleanVersion;
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
