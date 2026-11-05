import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { execa } from "execa";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { TEST_RUNTIME_VERSION } from "../config";
import { cliPath } from "../devnet";

/**
 * Covers what `cartesi run` checks before it starts anything. A dry run only
 * renders the compose configuration, so no environment is started and no
 * application needs to be built.
 */
describe("run", () => {
    let dir: string;

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "run-"));
    });

    afterAll(() => fs.removeSync(dir));

    const dryRun = (args: string[]) =>
        execa(
            "node",
            [
                cliPath,
                "run",
                "--dry-run",
                "--runtime-version",
                TEST_RUNTIME_VERSION,
                ...args,
            ],
            { all: true, cwd: dir, reject: false },
        );

    describe("--default-block", () => {
        it("should pass a supported default block to the node", async () => {
            const { all, exitCode } = await dryRun(["--default-block", "safe"]);

            expect(exitCode, all).toBe(0);
            expect(all).toContain("CARTESI_BLOCKCHAIN_DEFAULT_BLOCK: safe");
        });

        // the node refuses to start with 'pending', so the CLI rejects it
        // before rendering anything
        it("should reject pending before rendering the configuration", async () => {
            const { all, exitCode } = await dryRun([
                "--default-block",
                "pending",
            ]);

            expect(exitCode).not.toBe(0);
            expect(all).toContain(
                "Allowed choices are latest, safe, finalized",
            );
            expect(all).not.toContain("CARTESI_BLOCKCHAIN_DEFAULT_BLOCK");
        });
    });
});
