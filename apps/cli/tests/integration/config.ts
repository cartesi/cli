import { execa } from "execa";
import fs from "node:fs";
import path from "node:path";
import tmp from "tmp";
import { DEFAULT_SDK_IMAGE, DEFAULT_SDK_VERSION } from "../../src/config.js";

// CARTESI_TEST_SDK points the suite at another image, e.g. one baked from packages/sdk
export const TEST_SDK =
    process.env.CARTESI_TEST_SDK ??
    `${DEFAULT_SDK_IMAGE}:${DEFAULT_SDK_VERSION}`;

/**
 * Ensures the required Docker image is available locally.
 * Checks if the image exists, and pulls it if not found.
 */
export async function ensureDockerImage(image: string): Promise<void> {
    try {
        // Check if image exists locally
        await execa("docker", ["inspect", image], {
            reject: true,
        });
        console.log(`✓ Docker image ${image} is available`);
    } catch (_error) {
        try {
            // Image doesn't exist, pull it
            console.log(`Pulling Docker image ${image}...`);
            await execa("docker", ["image", "pull", image], {
                stdio: "inherit",
                reject: true,
            });
            console.log(`✓ Docker image ${image} pulled successfully`);
        } catch (error) {
            console.error(`✗ Failed to pull Docker image ${image}`);
            throw error;
        }
    }
}

/**
 * Creates a sandboxed Cartesi application inside a temporary directory,
 * builds it, and returns the path to the resulting build/machine and the directory itself.
 *
 * @returns {Promise<{ appDir: string, machineDir: string, cleanup: () => void }>}
 */
export async function createTemporaryCartesiApplication(options?: {
    /** contents of a cartesi.toml written after create and before build */
    config?: string;
}): Promise<{
    appDir: string;
    machineDir: string;
    cleanup: () => void;
}> {
    // Create a secure temporary directory that auto-cleans on exit
    const tempDir = tmp.dirSync({ unsafeCleanup: true });
    const cliPath = path.join(__dirname, "..", "..", "dist", "index.js");

    if (!fs.existsSync(cliPath)) {
        throw new Error(
            `CLI binary not found at ${cliPath}. Please build the CLI before running tests.`,
        );
    }

    const isCI = process.env.CI === "true" || process.env.CI === "1";

    console.log(`✓ Temporary sandbox directory created at: ${tempDir.name}`);
    console.log(`✓ CLI binary located at: ${cliPath}`);
    console.log(`✓ Using Docker image: ${TEST_SDK}`);
    console.log(`! Creating a temporary Cartesi application in the sandbox...`);

    // Save original working directory
    const originalCwd = process.cwd();

    try {
        // Switch process working directory into the sandbox
        process.chdir(tempDir.name);

        await execa("node", [
            cliPath,
            "create",
            "--template",
            "typescript",
            "temp-app",
        ]);

        const appDir = path.join(tempDir.name, "temp-app");

        console.log(`✓ Temporary Cartesi application created at: ${appDir}`);

        //  Change directory into the created application
        process.chdir(appDir);

        if (options?.config !== undefined) {
            fs.writeFileSync(path.join(appDir, "cartesi.toml"), options.config);
            console.log(`✓ Wrote a custom cartesi.toml`);
        }

        console.log(`! Building the temporary Cartesi application...`);

        //  Programmatically BUILD the application
        const flags = isCI ? ["--verbose"] : [];
        await execa("node", [cliPath, "build", ...flags], {
            stdio: "inherit",
            reject: true,
        });

        console.log(`✓ Temporary Cartesi application built successfully.`);

        // Path to the compiled machine image
        const machineDir = path.join(appDir, ".cartesi", "image");

        return {
            appDir,
            machineDir,
            cleanup: () => {
                // Restore working directory and wipe temporary files
                process.chdir(originalCwd);
                tempDir.removeCallback();
            },
        };
    } catch (error) {
        // Ensure cwd is restored even if build/creation fails
        process.chdir(originalCwd);
        tempDir.removeCallback();
        throw error;
    }
}

/**
 * Global setup function for integration tests.
 * Call this before running integration tests to ensure Docker image is ready.
 */
export async function setupIntegrationTests(): Promise<void> {
    await ensureDockerImage(TEST_SDK);
    await ensureDockerImage("debian:bookworm-slim");
}
