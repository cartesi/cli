import { execa } from "execa";
import {
        DEFAULT_SDK_IMAGE,
        DEFAULT_SDK_VERSION
} from "../../src/config.js";

export const TEST_SDK = `${DEFAULT_SDK_IMAGE}:${DEFAULT_SDK_VERSION}`;

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
 * Global setup function for integration tests.
 * Call this before running integration tests to ensure Docker image is ready.
 */
export async function setupIntegrationTests(): Promise<void> {
    await ensureDockerImage(TEST_SDK);
    await ensureDockerImage("debian:bookworm-slim");
}
