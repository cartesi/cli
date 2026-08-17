import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import tmp from "tmp";
import { isHash } from "viem";
import { cartesiMachineStoredHash } from "../../../src/exec";
import {
    createTemporaryCartesiApplication,
    setupIntegrationTests,
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
        const machineHash =
            await cartesiMachineStoredHash.computeHash(machineDir);

        // the value depends on the emulator and kernel versions, so this only
        // asserts it is a well formed hash, and a stable one
        expect(machineHash).toBeDefined();
        expect(machineHash && isHash(machineHash)).toBeTrue();
        expect(machineHash).toEqual(
            await cartesiMachineStoredHash.computeHash(machineDir),
        );
    });

    it("should return undefined for a non-existent machine directory", async () => {
        const machineHash = await cartesiMachineStoredHash.computeHash(
            path.join(import.meta.dirname, "random", ".cartesi", "image"),
        );

        expect(machineHash).toBeUndefined();
    });

    it("should return undefined when given an empty/corrupted machine directory", async () => {
        // Create an empty temporary directory simulating missing machine structures
        const tempDir = tmp.dirSync({ unsafeCleanup: true });

        // write an empty config.json file to simulate a corrupted machine directory
        writeFileSync(path.join(tempDir.name, "config.json"), "{}");
        const machineHash = await cartesiMachineStoredHash.computeHash(
            tempDir.name,
        );

        expect(machineHash).toBeUndefined();
        tempDir.removeCallback();
    });

    it("should return undefined when a file path is passed instead of a directory", async () => {
        // Create a temporary blank file
        const tempFile = tmp.fileSync();
        const machineHash = await cartesiMachineStoredHash.computeHash(
            tempFile.name,
        );

        expect(machineHash).toBeUndefined();
        tempFile.removeCallback();
    });
});
