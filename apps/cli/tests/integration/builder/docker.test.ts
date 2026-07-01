import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "bun:test";
import fs from "fs-extra";
import path from "node:path";
import tmp from "tmp";
import { build } from "../../../src/builder/docker.js";
import type { DockerDriveConfig } from "../../../src/config.js";
import { setupIntegrationTests, TEST_SDK } from "../config.js";
import { cleanupTempDir, createTempDir } from "./tmpdirTest.js";

beforeAll(
    async () => {
        tmp.setGracefulCleanup();
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
