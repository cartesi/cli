import { execa } from "execa";
import semver from "semver";
import { DEFAULT_SDK_IMAGE, DEFAULT_SDK_VERSION } from "../config.js";
import { cartesiMachine } from "../exec/index.js";
import { findPostgres } from "../host/postgres.js";
import { checkTool, HOST_TOOLS } from "../host/tools.js";

const MINIMUM_DOCKER_VERSION = "25.0.0"; // Replace with our minimum required Docker version
const MINIMUM_BUILDX_VERSION = "0.13.0"; // Replace with our minimum required Buildx version

const BUILDX_NOT_INSTALLED =
    "Docker Buildx is required but not installed. Please refer to the Docker Desktop documentation for installation instructions: https://docs.docker.com/desktop/";

export type DoctorCheck = {
    /** Name of the requirement being checked. */
    name: string;

    /**
     * Whether the requirement is satisfied (`ok`), is not (`failed`), is
     * optional and not satisfied (`warning`), or could not be checked because
     * a requirement it depends on is not satisfied (`skipped`).
     */
    status: "ok" | "failed" | "skipped" | "warning";

    /** Detail of a satisfied requirement, usually the installed version. */
    detail?: string;

    /** Reason why the requirement is not satisfied, or was skipped. */
    message?: string;
};

export type DoctorResult = {
    /** Whether all requirements are satisfied, the optional ones aside. */
    ok: boolean;

    /** Every requirement checked, satisfied or not. */
    checks: DoctorCheck[];
};

type Check = {
    name: string;

    /** Names of the checks this one depends on, listed before it. */
    requires?: string[];

    run: () => Promise<string | undefined>;
};

/**
 * Run a docker command, turning the failures of a missing docker, or of a
 * missing docker plugin, into messages that say what to install.
 * @param args arguments of the docker command
 * @param notInstalled message for the docker exit code of an unknown command
 * @returns the standard output of the command
 */
const docker = async (args: string[], notInstalled?: string) => {
    try {
        const { stdout } = await execa("docker", args);
        return stdout;
    } catch (e: unknown) {
        if (
            e instanceof Error &&
            (e as NodeJS.ErrnoException).code === "ENOENT"
        ) {
            throw new Error("Docker not found");
        }
        if (
            notInstalled &&
            e instanceof Error &&
            (e as Error & { exitCode?: number }).exitCode === 125
        ) {
            throw new Error(notInstalled);
        }
        throw e;
    }
};

const checkDocker = async (): Promise<string | undefined> => {
    const dockerVersion = await docker([
        "version",
        "--format",
        "{{json .Client.Version}}",
    ]);

    const v = semver.coerce(dockerVersion);
    if (v !== null && !semver.gte(v, MINIMUM_DOCKER_VERSION)) {
        throw new Error(
            `Unsupported Docker version. Minimum required version is ${MINIMUM_DOCKER_VERSION}. Installed version is ${v}.`,
        );
    }
    return v?.version;
};

const checkBuildx = async (): Promise<string | undefined> => {
    const buildxOutput = await docker(
        ["buildx", "version"],
        BUILDX_NOT_INSTALLED,
    );

    const v = semver.coerce(buildxOutput);
    if (v !== null && !semver.gte(v, MINIMUM_BUILDX_VERSION)) {
        throw new Error(
            `Unsupported Docker Buildx version. Minimum required version is ${MINIMUM_BUILDX_VERSION}. Installed version is ${v}.`,
        );
    }
    return v?.version;
};

const checkRiscv = async (): Promise<string | undefined> => {
    const platformsOutput = await docker(
        ["buildx", "ls", "--format", "{{.Platforms}}"],
        BUILDX_NOT_INSTALLED,
    );

    const buildxPlatforms: string[] = platformsOutput
        .split(",")
        .map((platform) => platform.trim());

    if (!buildxPlatforms.includes("linux/riscv64")) {
        throw new Error(
            "Your system does not support riscv64 architecture. Run `docker run --privileged --rm tonistiigi/binfmt:riscv` to enable riscv64 support.",
        );
    }
    return "linux/riscv64";
};

const checkCartesiMachine = async (): Promise<string | undefined> => {
    // doctor does not read cartesi.toml, so check against the default sdk image. the host binary
    // still takes precedence, which is the install most likely to be out of date
    const v = await cartesiMachine.version({
        image: `${DEFAULT_SDK_IMAGE}:${DEFAULT_SDK_VERSION}`,
    });

    if (v === null) {
        throw new Error(
            "Could not determine the Cartesi Machine version. Check that Docker is running.",
        );
    }
    if (!semver.satisfies(v.format(), cartesiMachine.requiredVersion)) {
        throw new Error(
            `Unsupported Cartesi Machine version. Required version is ${cartesiMachine.requiredVersion.raw}. Installed version is ${v.format()}.`,
        );
    }
    return v.format();
};

/** An optional requirement that is not satisfied. */
class DoctorWarning extends Error {}

/**
 * Check a tool `cartesi run` runs on the host: installed, and of a supported
 * version. A tool not every run needs is only a warning.
 */
const checkHostTool =
    (command: string | (() => Promise<string>)) =>
    async (): Promise<string | undefined> => {
        const resolved =
            typeof command === "string" ? command : await command();
        const check = await checkTool(resolved);
        const tool = HOST_TOOLS[check.name];
        const optional = tool?.neededFor !== undefined;
        const fail = (message: string) => {
            throw optional ? new DoctorWarning(message) : new Error(message);
        };
        if (!check.path) {
            fail(
                `${check.name} not installed, which ${tool?.neededFor ?? "cartesi run"} needs: install ${tool?.install ?? check.name}`,
            );
        }
        if (check.warning) {
            fail(check.warning);
        }
        return check.version;
    };

/** The postgres of the environment: the embedded one, or the host's. */
const postgresBinary = async () => (await findPostgres()).postgres;
const initdbBinary = async () => (await findPostgres()).initdb;

// the Cartesi Machine check requires nothing, as a host cartesi-machine
// satisfies it without docker
const checks: Check[] = [
    { name: "Docker Engine", run: checkDocker },
    {
        name: "Docker Buildx",
        requires: ["Docker Engine"],
        run: checkBuildx,
    },
    {
        name: "Docker RISC-V support",
        requires: ["Docker Engine", "Docker Buildx"],
        run: checkRiscv,
    },
    { name: "Cartesi Machine", run: checkCartesiMachine },
    // cartesi run
    { name: "anvil", run: checkHostTool("anvil") },
    {
        name: "cartesi-rollups-node",
        run: checkHostTool("cartesi-rollups-node"),
    },
    { name: "cartesi-rollups-cli", run: checkHostTool("cartesi-rollups-cli") },
    {
        name: "cartesi-jsonrpc-machine",
        run: checkHostTool("cartesi-jsonrpc-machine"),
    },
    { name: "postgres", run: checkHostTool(postgresBinary) },
    { name: "initdb", run: checkHostTool(initdbBinary) },
    // what only some commands, or some runs, need
    {
        name: "cartesi-rollups-machine-tool",
        run: checkHostTool("cartesi-rollups-machine-tool"),
    },
    { name: "cartesi-sling-node", run: checkHostTool("cartesi-sling-node") },
    { name: "alto", run: checkHostTool("alto") },
    {
        name: "mock-verifying-paymaster",
        run: checkHostTool("mock-verifying-paymaster"),
    },
    { name: "passkey-server", run: checkHostTool("passkey-server") },
];

/**
 * Mark the checks whose requirements are not satisfied as skipped, as their
 * own failure would only repeat the failure of the requirement. A check lists
 * its requirements before it, so a skipped requirement skips its dependents.
 * @param checks the checks, with their requirements
 * @param results the result of each check, in the same order
 * @returns the results, with the checks whose requirements failed skipped
 */
export const skipUnmetRequirements = (
    checks: { name: string; requires?: string[] }[],
    results: DoctorCheck[],
): DoctorCheck[] => {
    const status = new Map<string, DoctorCheck["status"]>();
    return results.map((result, index) => {
        const unmet = checks[index]?.requires?.find(
            (name) => status.get(name) !== "ok",
        );
        const check: DoctorCheck =
            unmet === undefined
                ? result
                : {
                      name: result.name,
                      status: "skipped",
                      message: `requires ${unmet}`,
                  };
        status.set(check.name, check.status);
        return check;
    });
};

/**
 * Check whether the system has everything needed to build and run Cartesi
 * applications. All requirements are checked concurrently, and the result of
 * every check is reported, satisfied or not. A check whose requirement is not
 * satisfied is reported as skipped, instead of failing on its own.
 * @returns the result of every check
 */
export const doctor = async (): Promise<DoctorResult> => {
    const results = await Promise.all(
        checks.map(async ({ name, run }): Promise<DoctorCheck> => {
            try {
                return { name, status: "ok", detail: await run() };
            } catch (e: unknown) {
                return {
                    name,
                    status: e instanceof DoctorWarning ? "warning" : "failed",
                    message: e instanceof Error ? e.message : String(e),
                };
            }
        }),
    );

    const resolved = skipUnmetRequirements(checks, results);
    return {
        ok: resolved.every(
            (check) => check.status === "ok" || check.status === "warning",
        ),
        checks: resolved,
    };
};
