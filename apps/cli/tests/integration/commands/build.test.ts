import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    setDefaultTimeout,
} from "bun:test";
import { execa } from "execa";
import fs from "fs-extra";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { setupIntegrationTests, TEST_SDK } from "../config";
import { cliPath } from "../devnet";

// each build is a riscv64 docker build plus the ext2 conversion
setDefaultTimeout(180000);

// a non-deterministic RUN layer, so a reused layer is told from a rebuilt one
const dockerfile = path.join(
    __dirname,
    "..",
    "builder",
    "fixtures",
    "Dockerfile.cache",
);

// Exporting a local cache needs a docker-container builder. A disposable one
// owned by the test keeps the developer's builders untouched, and it is given
// to the CLI through its environment only.
const builder = `cartesi-cli-build-test-${process.pid}`;

const sha256 = (file: string) =>
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

describe("build", () => {
    let appDir: string;

    const build = (...args: string[]) =>
        execa("node", [cliPath, "build", "--drives-only", ...args], {
            all: true,
            cwd: appDir,
            env: { BUILDX_BUILDER: builder },
            reject: false,
        });

    const writeConfig = (config = "") =>
        fs.writeFile(
            path.join(appDir, "cartesi.toml"),
            `sdk = "${TEST_SDK}"\n${config}`,
        );

    beforeAll(async () => {
        await setupIntegrationTests();
        await execa("docker", [
            "buildx",
            "create",
            "--name",
            builder,
            "--driver",
            "docker-container",
        ]);
    });

    afterAll(async () => {
        await execa("docker", ["buildx", "rm", "--force", builder], {
            reject: false,
        });
    });

    beforeEach(async () => {
        appDir = await fs.mkdtemp(path.join(os.tmpdir(), "build-cache-"));
        await fs.copy(dockerfile, path.join(appDir, "Dockerfile"));
        await writeConfig();
    });

    afterEach(async () => {
        await fs.remove(appDir);
    });

    it("should write and read the cache given by --cache-to and --cache-from", async () => {
        const cache = path.join(appDir, "cache");
        const drive = path.join(appDir, ".cartesi", "root.ext2");

        const first = await build("--cache-to", `type=local,dest=${cache}`);
        expect(first.exitCode, first.all).toBe(0);
        expect(fs.existsSync(path.join(cache, "index.json"))).toBe(true);
        const hash = sha256(drive);

        // drop every layer the builder holds, so only the cache can give it back
        await execa("docker", ["buildx", "prune", "--all", "--force"], {
            env: { BUILDX_BUILDER: builder },
        });

        const second = await build("--cache-from", `type=local,src=${cache}`);
        expect(second.exitCode, second.all).toBe(0);

        // a rebuilt RUN layer writes another date, so another drive
        expect(sha256(drive)).toEqual(hash);
    });

    it("should write the cache given by cache_to in cartesi.toml", async () => {
        const cache = path.join(appDir, "toml-cache");
        await writeConfig(
            `[drives.root]\ncache_to = ["type=local,dest=${cache}"]\n`,
        );

        const result = await build();
        expect(result.exitCode, result.all).toBe(0);
        expect(fs.existsSync(path.join(cache, "index.json"))).toBe(true);
    });

    it("should prefer --cache-to over cache_to in cartesi.toml", async () => {
        const tomlCache = path.join(appDir, "toml-cache");
        const flagCache = path.join(appDir, "flag-cache");
        await writeConfig(
            `[drives.root]\ncache_to = ["type=local,dest=${tomlCache}"]\n`,
        );

        const result = await build(
            "--cache-to",
            `type=local,dest=${flagCache}`,
        );
        expect(result.exitCode, result.all).toBe(0);
        expect(fs.existsSync(path.join(flagCache, "index.json"))).toBe(true);
        expect(fs.existsSync(tomlCache)).toBe(false);
    });
});
