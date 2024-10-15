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
            dockerfile: path.join(__dirname, "data", "Dockerfile.nonriscv"),
            extraSize: 0,
            format: "ext2",
            tags: [],
            image: undefined,
            target: undefined,
        };
        await expect(build("root", drive, image, destination)).rejects.toThrow(
            "Invalid image Architecture: arm64. Expected riscv64",
        );
    });

    tmpdirTest(
        "should build a docker drive",
        { timeout: 60000 },
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
                target: undefined,
            };
            await build("root", drive, image, destination);
        },
    );
});
