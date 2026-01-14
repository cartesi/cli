import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import { execa } from "execa";
import ora, { type Ora } from "ora";
import semver from "semver";

const MINIMUM_DOCKER_VERSION = "25.0.0"; // Replace with our minimum required Docker version
const MINIMUM_DOCKER_COMPOSE_VERSION = "2.24.0"; // Replace with our minimum required Docker Compose version
const MINIMUM_BUILDX_VERSION = "0.13.0"; // Replace with our minimum required Buildx version

const checkDocker = async (progress: Ora): Promise<true | never> => {
    try {
        progress.start("Checking Docker Engine version...");
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
        progress.succeed(`Docker Engine ${chalk.cyan(v)}`);
    } catch (e: unknown) {
        if (
            e instanceof Error &&
            (e as NodeJS.ErrnoException).code === "ENOENT"
        ) {
            throw new Error("Docker not found");
        }
        throw e;
    }

    return true;
};

const checkCompose = async (progress: Ora): Promise<true | never> => {
    try {
        progress.start("Checking Docker Compose version...");
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
        progress.succeed(`Docker Compose ${chalk.cyan(dockerComposeVersion)}`);
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

    return true;
};

const checkBuildx = async (progress: Ora): Promise<true | never> => {
    try {
        progress.start("Checking Docker Buildx version...");
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
        progress.succeed(`Docker Buildx ${chalk.cyan(v)}`);

        progress.start("Checking Docker RISC-V support...");
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
        progress.succeed(
            `Docker RISC-V support ${chalk.cyan("linux/riscv64")}`,
        );
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

    return true;
};

export const createDoctorCommand = () => {
    return new Command("doctor").action(async () => {
        const progress = ora();
        try {
            await checkDocker(progress);
            await checkCompose(progress);
            await checkBuildx(progress);
            progress.succeed("Your system is ready.");
        } catch (e: unknown) {
            progress.fail((e as Error).message);
            process.exit(1);
        }
    });
};
