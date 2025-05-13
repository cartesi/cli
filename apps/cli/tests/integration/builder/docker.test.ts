import fs from "fs-extra";
import { beforeEach } from "node:test";
import path from "path";
import { describe, expect } from "vitest";
import { build } from "../../../src/builder/docker.js";
import { DockerDriveConfig } from "../../../src/config.js";
import { TEST_SDK } from "../config.js";
import { tmpdirTest } from "./tmpdirTest.js";

describe("when building with the docker builder", () => {
    const image = TEST_SDK;

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
            dockerfile: "Dockerfile",
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
                context: path.join(__dirname, "fixtures"),
                dockerfile: path.join(__dirname, "fixtures", "Dockerfile"),
                extraSize: 0,
                format: "ext2",
                tags: [],
                image: undefined,
                target: "test",
            };
            await build("root", drive, image, destination);
            const filename = path.join(destination, "root.ext2");
            const stat = fs.statSync(filename);
            expect(stat.size).toEqual(85917696);
        },
    );

    tmpdirTest("should build an ext2 drive", async ({ tmpdir }) => {
        const destination = tmpdir;
        const drive: DockerDriveConfig = {
            builder: "docker",
            context: path.join(__dirname, "fixtures"),
            dockerfile: path.join(__dirname, "fixtures", "Dockerfile"),
            extraSize: 0,
            format: "ext2",
            tags: [],
            image: undefined,
            target: undefined,
        };
        await build("root", drive, image, destination);
        const filename = path.join(destination, "root.ext2");
        const stat = fs.statSync(filename);
        expect(stat.size).toEqual(85917696);
    });

    tmpdirTest.skip("should build a sqfs drive", async ({ tmpdir }) => {
        const destination = tmpdir;
        const drive: DockerDriveConfig = {
            builder: "docker",
            context: path.join(__dirname, "fixtures"),
            dockerfile: path.join(__dirname, "fixtures", "Dockerfile"),
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
