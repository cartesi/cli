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

    const dryRun = (args: string[], env?: Record<string, string>) =>
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
            { all: true, cwd: dir, env, reject: false },
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

    describe("host variables", () => {
        // compose prints the value it would pass as `$$`, the way it reads it
        // back; unescaped, it would have replaced `$t` with nothing
        it("should keep the $ in a forwarded node variable", async () => {
            const { all, exitCode } = await dryRun([], {
                CARTESI_BLOCKCHAIN_HTTP_AUTHORIZATION: "Bearer s3cr$t",
            });

            expect(exitCode, all).toBe(0);
            expect(all).toContain(
                "CARTESI_BLOCKCHAIN_HTTP_AUTHORIZATION: Bearer s3cr$$t",
            );
        });
    });

    describe("key files", () => {
        it("should hand the node a copy of a key file named on the host", async () => {
            fs.writeFileSync(path.join(dir, "claimer.key"), "0xsecret\n");

            const { all, exitCode } = await dryRun([], {
                CARTESI_AUTH_PRIVATE_KEY_FILE: "claimer.key",
            });

            expect(exitCode, all).toBe(0);
            expect(all).toContain(
                "CARTESI_AUTH_PRIVATE_KEY_FILE: /run/secrets/cartesi_auth_private_key_file",
            );
            expect(all).toContain("node-secret-init:");
            expect(all).toContain("condition: service_completed_successfully");
            expect(all).toContain(path.join(dir, "claimer.key"));
            expect(all).not.toContain("0xsecret");
        });

        it("should reject a missing key file before rendering", async () => {
            const { all, exitCode } = await dryRun([], {
                CARTESI_AUTH_PRIVATE_KEY_FILE: "missing.key",
            });

            expect(exitCode).not.toBe(0);
            expect(all).toContain(
                'CARTESI_AUTH_PRIVATE_KEY_FILE must name a readable file: "missing.key"',
            );
            expect(all).not.toContain("services:");
        });
    });
});
