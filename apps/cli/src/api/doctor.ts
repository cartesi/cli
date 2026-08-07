import { execa } from "execa";
import semver from "semver";

const MINIMUM_DOCKER_VERSION = "25.0.0"; // Replace with our minimum required Docker version
const MINIMUM_DOCKER_COMPOSE_VERSION = "2.24.0"; // Replace with our minimum required Docker Compose version
const MINIMUM_BUILDX_VERSION = "0.13.0"; // Replace with our minimum required Buildx version

export type DoctorCheck = {
    /** Name of the requirement being checked. */
    name: string;

    /** Whether the requirement is satisfied. */
    ok: boolean;

    /** Detail of a satisfied requirement, usually the installed version. */
    detail?: string;

    /** Reason why the requirement is not satisfied. */
    message?: string;
};

export type DoctorResult = {
    /** Whether all requirements are satisfied. */
    ok: boolean;

    /** Requirements checked, in the order they were checked. */
    checks: DoctorCheck[];
};

export type DoctorOptions = {
    /** Called with a description of the requirement when its check starts. */
    onCheckStart?: (title: string) => void;

    /** Called when the check of a requirement completes. */
    onCheck?: (check: DoctorCheck) => void;
};

type Check = {
    name: string;
    title: string;
    run: () => Promise<string | undefined>;
};

const checkDocker = async (): Promise<string | undefined> => {
    try {
        const { stdout: dockerVersion } = await execa("docker", [
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
    } catch (e: unknown) {
        if (
            e instanceof Error &&
            (e as NodeJS.ErrnoException).code === "ENOENT"
        ) {
            throw new Error("Docker not found");
        }
        throw e;
    }
};

const checkCompose = async (): Promise<string | undefined> => {
    try {
        const { stdout: dockerComposeVersion } = await execa("docker", [
            "compose",
            "version",
            "--short",
        ]);

        const v = semver.coerce(dockerComposeVersion);
        if (v !== null && !semver.gte(v, MINIMUM_DOCKER_COMPOSE_VERSION)) {
            throw new Error(
                `Unsupported Docker Compose version. Minimum required version is ${MINIMUM_DOCKER_COMPOSE_VERSION}. Installed version is ${v}.`,
            );
        }
        return dockerComposeVersion;
    } catch (e: unknown) {
        if (
            e instanceof Error &&
            (e as Error & { exitCode?: number }).exitCode === 125
        ) {
            throw new Error(
                "Docker Compose is required but not installed or the command execution failed. Please refer to the Docker Compose documentation for installation instructions: https://docs.docker.com/compose/install/",
            );
        }
        throw e;
    }
};

const checkBuildx = async (): Promise<string | undefined> => {
    try {
        const { stdout: buildxOutput } = await execa("docker", [
            "buildx",
            "version",
        ]);

        const v = semver.coerce(buildxOutput);
        if (v !== null && !semver.gte(v, MINIMUM_BUILDX_VERSION)) {
            throw new Error(
                `Unsupported Docker Buildx version. Minimum required version is ${MINIMUM_BUILDX_VERSION}. Installed version is ${v}.`,
            );
        }
        return v?.version;
    } catch (e: unknown) {
        if (
            e instanceof Error &&
            (e as Error & { exitCode?: number }).exitCode === 125
        ) {
            throw new Error(
                "Docker Buildx is required but not installed. Please refer to the Docker Desktop documentation for installation instructions: https://docs.docker.com/desktop/",
            );
        }
        throw e;
    }
};

const checkRiscv = async (): Promise<string | undefined> => {
    const { stdout: platformsOutput } = await execa("docker", [
        "buildx",
        "ls",
        "--format",
        "{{.Platforms}}",
    ]);

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

const checks: Check[] = [
    {
        name: "Docker Engine",
        title: "Checking Docker Engine version...",
        run: checkDocker,
    },
    {
        name: "Docker Compose",
        title: "Checking Docker Compose version...",
        run: checkCompose,
    },
    {
        name: "Docker Buildx",
        title: "Checking Docker Buildx version...",
        run: checkBuildx,
    },
    {
        name: "Docker RISC-V support",
        title: "Checking Docker RISC-V support...",
        run: checkRiscv,
    },
];

/**
 * Check whether the system has everything needed to build and run Cartesi
 * applications. Checks are executed in order and stop at the first failure.
 * @param options doctor options
 * @returns the result of every check executed
 */
export const doctor = async (
    options: DoctorOptions = {},
): Promise<DoctorResult> => {
    const { onCheck, onCheckStart } = options;
    const results: DoctorCheck[] = [];

    for (const { name, run, title } of checks) {
        onCheckStart?.(title);
        let check: DoctorCheck;
        try {
            check = { name, ok: true, detail: await run() };
        } catch (e: unknown) {
            check = {
                name,
                ok: false,
                message: e instanceof Error ? e.message : String(e),
            };
        }
        results.push(check);
        onCheck?.(check);

        if (!check.ok) {
            // stop at the first failed check
            return { ok: false, checks: results };
        }
    }

    return { ok: true, checks: results };
};
