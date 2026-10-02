import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { execa } from "execa";
import getPort, { portNumbers } from "get-port";
import tmp from "tmp";
import {
    startEnvironment,
    stopEnvironment,
    waitHealthyEnvironment,
} from "../../src/exec/rollups.js";
import { TEST_RUNTIME_VERSION } from "./config.js";

// The node starts its PRT service on every run and refuses to boot without a
// signer, so a healthy environment is the regression test for the CLI always
// setting CARTESI_PRT_AUTH_MNEMONIC, not only under --prt. No machine snapshot
// is needed: the node serves /livez before any application is deployed.
describe("rollups node startup", () => {
    const projectName = `cli-node-startup-${process.pid}`;
    let port: number;
    let directory: tmp.DirResult;
    let originalCwd: string;

    beforeAll(async () => {
        originalCwd = process.cwd();
        directory = tmp.dirSync({ unsafeCleanup: true });
        // compose files are written relative to the working directory
        process.chdir(directory.name);
        port = await getPort({ port: portNumbers(16751, 16761) });
    });

    afterAll(async () => {
        try {
            await stopEnvironment({ projectName });
        } finally {
            process.chdir(originalCwd);
            directory.removeCallback();
        }
    });

    it("should reach a healthy node without prt", async () => {
        await startEnvironment({
            blockTime: 1,
            defaultBlock: "latest",
            detach: true,
            dryRun: false,
            port,
            projectName,
            prt: false,
            runtimeVersion: TEST_RUNTIME_VERSION,
            services: [],
            verbose: false,
        });

        // throws when any base service fails to become healthy
        await waitHealthyEnvironment({ port, projectName, services: [] });

        const { stdout } = await execa("docker", [
            "compose",
            "--project-name",
            projectName,
            "logs",
            "rollups_node",
        ]);

        // the node logs the identity it derived from the PRT mnemonic, which
        // proves the signer was used and not merely that the node booted
        expect(stdout).toContain("PRT submitter identity");
    }, 300_000);
});
