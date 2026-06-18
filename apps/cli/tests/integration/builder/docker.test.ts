import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "bun:test";
import crypto from "node:crypto";
import fs from "fs-extra";
import path from "node:path";
import { execa } from "execa";
import { build } from "../../../src/builder/docker.js";
import type { DockerDriveConfig } from "../../../src/config.js";
import { setupIntegrationTests, TEST_SDK } from "../config.js";
import { cleanupTempDir, createTempDir } from "./tmpdirTest.js";

beforeAll(
    async () => {
        await setupIntegrationTests();
    },
    { timeout: 60000 },
);

describe("when building with the docker builder", () => {
    const image = TEST_SDK;
    let destination: string;

    beforeEach(async () => {
        destination = await createTempDir();
    });

    afterEach(async () => {
        await cleanupTempDir(destination);
    });

    it("should fail without correct context", async () => {
        const drive: DockerDriveConfig = {
            buildArgs: [],
            builder: "docker",
            cacheFrom: [],
            cacheTo: [],
            context: ".",
            dockerfile: "Dockerfile",
            extraSize: 0,
            format: "ext2",
            tags: [],
            image: undefined,
            target: undefined,
        };
        await expect(
            build("root", drive, image, destination, false),
        ).rejects.toThrow("exit code 1");
    });

    it("should fail a non-riscv image", async () => {
        const drive: DockerDriveConfig = {
            buildArgs: [],
            builder: "docker",
            cacheFrom: [],
            cacheTo: [],
            context: path.join(__dirname, "data"),
            dockerfile: "Dockerfile",
            extraSize: 0,
            format: "ext2",
            tags: [],
            image: "debian:bookworm-slim",
            target: undefined,
        };
        await expect(
            build("root", drive, image, destination, false),
        ).rejects.toThrow(/no match for platform in manifest/);
    });

    it("should build an ext2 drive with a target definition", async () => {
        const drive: DockerDriveConfig = {
            buildArgs: [],
            builder: "docker",
            cacheFrom: [],
            cacheTo: [],
            context: path.join(__dirname, "fixtures"),
            dockerfile: path.join(__dirname, "fixtures", "Dockerfile"),
            extraSize: 0,
            format: "ext2",
            tags: [],
            image: undefined,
            target: "test",
        };
        await build("root", drive, image, destination, false);
        const filename = path.join(destination, "root.ext2");
        const stat = fs.statSync(filename);
        expect(stat.size).toEqual(93716480);
    });

    it("should build an ext2 drive", async () => {
        const drive: DockerDriveConfig = {
            buildArgs: [],
            builder: "docker",
            cacheFrom: [],
            cacheTo: [],
            context: path.join(__dirname, "fixtures"),
            dockerfile: path.join(__dirname, "fixtures", "Dockerfile"),
            extraSize: 0,
            format: "ext2",
            tags: [],
            image: undefined,
            target: undefined,
        };
        await build("root", drive, image, destination, false);
        const filename = path.join(destination, "root.ext2");
        const stat = fs.statSync(filename);
        expect(stat.size).toEqual(93716480);
    });

    it.skip("should build a sqfs drive", async () => {
        const drive: DockerDriveConfig = {
            buildArgs: [],
            builder: "docker",
            cacheFrom: [],
            cacheTo: [],
            context: path.join(__dirname, "fixtures"),
            dockerfile: path.join(__dirname, "fixtures", "Dockerfile"),
            extraSize: 0,
            format: "sqfs",
            tags: [],
            image: undefined,
            target: undefined,
        };
        await build("root", drive, image, destination, false);
        const filename = path.join(destination, "root.sqfs");
        const stat = fs.statSync(filename);
        expect(stat.size).toEqual(29327360);
    });
});

describe("when using cache options", () => {
    const image = TEST_SDK;
    const CACHE_TEST_TAG = "cartesi-cli-integration-test-cache:latest";
    let destination: string;

    beforeEach(async () => {
        destination = await createTempDir();
    });

    afterEach(async () => {
        await cleanupTempDir(destination);
    });

    it(
        "should populate local cache when --cache-to is specified",
        async () => {
            const cacheDir = path.join(destination, "cache");
            const drive: DockerDriveConfig = {
                buildArgs: [],
                builder: "docker",
                cacheFrom: [],
                cacheTo: [`type=local,dest=${cacheDir}`],
                context: path.join(__dirname, "fixtures"),
                dockerfile: path.join(
                    __dirname,
                    "fixtures",
                    "Dockerfile.cache",
                ),
                extraSize: 0,
                format: "ext2",
                image: undefined,
                tags: [CACHE_TEST_TAG],
                target: undefined,
            };

            await build("root", drive, image, destination, false);

            // Clean up the tagged image
            await execa("docker", ["image", "rm", CACHE_TEST_TAG], {
                reject: false,
            });

            // Cache directory must have been written
            expect(fs.existsSync(path.join(cacheDir, "index.json"))).toBe(true);
        },
        { timeout: 120000 },
    );

    it(
        "should recover layers from local cache when --cache-from is specified",
        async () => {
            const cacheDir = path.join(destination, "cache");

            // ── Build 1: populate local cache ────────────────────────────────
            const driveWithCacheTo: DockerDriveConfig = {
                buildArgs: [],
                builder: "docker",
                cacheFrom: [],
                cacheTo: [`type=local,dest=${cacheDir}`],
                context: path.join(__dirname, "fixtures"),
                dockerfile: path.join(
                    __dirname,
                    "fixtures",
                    "Dockerfile.cache",
                ),
                extraSize: 0,
                format: "ext2",
                image: undefined,
                tags: [CACHE_TEST_TAG],
                target: undefined,
            };
            await build("root", driveWithCacheTo, image, destination, false);

            const hash1 = crypto
                .createHash("sha256")
                .update(fs.readFileSync(path.join(destination, "root.ext2")))
                .digest("hex");

            // ── Teardown: remove image from daemon and build cache ────────────
            // Remove tagged image so BuildKit cannot reuse its layers implicitly
            await execa("docker", ["image", "rm", CACHE_TEST_TAG], {
                reject: false,
            });
            // Remove all build-cache records from the daemon
            await execa("docker", ["builder", "prune", "--force"]);

            // Remove build artefacts so the second build starts clean
            await fs.remove(path.join(destination, "root.ext2"));

            // ── Build 2: rebuild using only the local cache ──────────────────
            const driveWithCacheFrom: DockerDriveConfig = {
                buildArgs: [],
                builder: "docker",
                cacheFrom: [`type=local,src=${cacheDir}`],
                cacheTo: [],
                context: path.join(__dirname, "fixtures"),
                dockerfile: path.join(
                    __dirname,
                    "fixtures",
                    "Dockerfile.cache",
                ),
                extraSize: 0,
                format: "ext2",
                image: undefined,
                tags: [],
                target: undefined,
            };
            await build("root", driveWithCacheFrom, image, destination, false);

            const hash2 = crypto
                .createHash("sha256")
                .update(fs.readFileSync(path.join(destination, "root.ext2")))
                .digest("hex");

            // ── Attest: cache was recovered ──────────────────────────────────
            // Identical hashes mean the RUN date layer was reused (not re-executed).
            // A fresh build would produce a different timestamp → different content → different hash.
            expect(hash2).toEqual(hash1);
        },
        { timeout: 180000 },
    );
});
