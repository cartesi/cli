import fs from "fs-extra";
import { beforeEach } from "node:test";
import path from "path";
import { describe, expect } from "vitest";
import { build } from "../../src/builder/docker";
import { DockerDriveConfig } from "../../src/config";
import { tmpdirTest } from "./tmpdirTest";

describe("when building with the docker builder", () => {
    const image = "cartesi/sdk:0.11.0";

    beforeEach(({ name }) => {
        fs.mkdirpSync(path.join(__dirname, "output", name));
    });

    tmpdirTest("should fail without correct context", async ({ tmpdir }) => {
        const destination = tmpdir;
        const drive: DockerDriveConfig = {
            builder: "docker",
            context: ".",
            dockerfile: "Dockerfile",
            extraSize: 0,
            format: "ext2",
            tags: [],
            image: undefined,
            target: undefined,
        };
        await expect(build("root", drive, image, destination)).rejects.toThrow(
            "exit code 1",
        );
    });

    tmpdirTest("should fail a non-riscv image", async ({ tmpdir }) => {
        const destination = tmpdir;
        const drive: DockerDriveConfig = {
            builder: "docker",
            context: path.join(__dirname, "data"),
            extraSize: 0,
            format: "ext2",
            tags: [],
            image: "debian:bookworm-slim",
            target: undefined,
        };
        await expect(build("root", drive, image, destination)).rejects.toThrow(
            "Expected riscv64",
        );
    });

    tmpdirTest(
        "should build an ext2 drive with a target definition",
        async ({ tmpdir }) => {
            const destination = tmpdir;
            const drive: DockerDriveConfig = {
                builder: "docker",
                context: path.join(__dirname, "data"),
                dockerfile: path.join(__dirname, "data", "Dockerfile"),
                extraSize: 0,
                format: "ext2",
                tags: [],
                image: undefined,
                target: "test",
            };
            await build("root", drive, image, destination);
            const filename = path.join(destination, "root.ext2");
            const stat = fs.statSync(filename);
            expect(stat.size).toEqual(76087296);
        },
    );

    tmpdirTest("should build an ext2 drive", async ({ tmpdir }) => {
        const destination = tmpdir;
        const drive: DockerDriveConfig = {
            builder: "docker",
            context: path.join(__dirname, "data"),
            dockerfile: path.join(__dirname, "data", "Dockerfile"),
            extraSize: 0,
            format: "ext2",
            tags: [],
            image: undefined,
            target: undefined,
        };
        await build("root", drive, image, destination);
        const filename = path.join(destination, "root.ext2");
        const stat = fs.statSync(filename);
        expect(stat.size).toEqual(76087296);
    });

    tmpdirTest.skip("should build a sqfs drive", async ({ tmpdir }) => {
        const destination = tmpdir;
        const drive: DockerDriveConfig = {
            builder: "docker",
            context: path.join(__dirname, "data"),
            dockerfile: path.join(__dirname, "data", "Dockerfile"),
            extraSize: 0,
            format: "sqfs",
            tags: [],
            image: undefined,
            target: undefined,
        };
        await build("root", drive, image, destination);
        const filename = path.join(destination, "root.sqfs");
        const stat = fs.statSync(filename);
        expect(stat.size).toEqual(29327360);
    });
});
