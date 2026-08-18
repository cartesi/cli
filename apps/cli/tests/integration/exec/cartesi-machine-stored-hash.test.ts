import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import tmp from "tmp";
import { isHash } from "viem";
import { cartesiMachineStoredHash } from "../../../src/exec";
import {
    createTemporaryCartesiApplication,
    setupIntegrationTests,
    TEST_SDK,
} from "../config";

let machineDir: string;
let cleanupTempApplication: () => void;

beforeAll(
    async () => {
        await setupIntegrationTests();
        const result = await createTemporaryCartesiApplication();
        machineDir = result.machineDir;
        cleanupTempApplication = result.cleanup;
    },
    { timeout: 60000 * 20 },
);

afterAll(() => {
    if (cleanupTempApplication) {
        cleanupTempApplication();
    }
});

describe("cartesi-machine-stored-hash", () => {
    it("should return a computed hash", async () => {
        const machineHash = await cartesiMachineStoredHash.computeHash("./", {
            forceDocker: true,
            image: TEST_SDK,
            cwd: machineDir,
        });

        expect(machineHash).toBeDefined();
        // @ts-expect-error - the above assertion ensures that machineHash is not undefined, so this type assertion is safe
        expect(isHash(machineHash)).toBeTrue();
    });

    it("should return undefined for a non-existent machine directory", async () => {
        const machineDir = path.join("random", ".cartesi", "image");

        const machineHash = await cartesiMachineStoredHash.computeHash(
            machineDir,
            {
                forceDocker: true,
                image: TEST_SDK,
                cwd: import.meta.dirname,
            },
        );

        expect(machineHash).toBeUndefined();
    });

    it("should return undefined when given an empty/corrupted machine directory", async () => {
        // Create an empty temporary directory simulating missing machine structures
        const tempDir = tmp.dirSync({ unsafeCleanup: true });

        // write an empty config.json file to simulate a corrupted machine directory
        writeFileSync(path.join(tempDir.name, "config.json"), "{}");
        const machineHash = await cartesiMachineStoredHash.computeHash(".", {
            forceDocker: true,
            image: TEST_SDK,
            cwd: tempDir.name,
        });

        expect(machineHash).toBeUndefined();
        tempDir.removeCallback();
    });

    it("should return undefined when a file path is passed instead of a directory", async () => {
        // Create a temporary blank file
        const tempFile = tmp.fileSync();
        const machineHash = await cartesiMachineStoredHash.computeHash(".", {
            forceDocker: true,
            image: TEST_SDK,
            cwd: tempFile.name,
        });

        expect(machineHash).toBeUndefined();
        tempFile.removeCallback();
    });
});
