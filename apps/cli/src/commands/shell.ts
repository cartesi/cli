import { Command, Option } from "clipanion";
import { execa } from "execa";
import fs from "fs-extra";
import { lookpath } from "lookpath";
import path from "path";
import { BaseCommand } from "../baseCommand.js";

export default class Shell extends BaseCommand {
    static paths = [["shell"]];

    static usage = Command.Usage({
        description: "Start a shell in cartesi machine of application",
        details: "Start a shell in cartesi machine of application",
    });

    runAsRoot = Option.Boolean("--run-as-root", {
        description: "run as root user",
    });

    private async startShell(ext2Path: string): Promise<void> {
        const containerDir = "/mnt";
        const bind = `${path.resolve(path.dirname(ext2Path))}:${containerDir}`;
        const ext2 = path.join(containerDir, path.basename(ext2Path));
        const ramSize = "128Mi";
        const driveLabel = "root";
        const sdkImage = "cartesi/sdk:0.6.0"; // XXX: how to resolve sdk version?
        const args = [
            "run",
            "--interactive",
            "--tty",
            "--volume",
            bind,
            sdkImage,
            "cartesi-machine",
            `--ram-length=${ramSize}`,
            "--append-bootargs=no4lvl",
            `--flash-drive=label:${driveLabel},filename:${ext2}`,
        ];

        if (this.runAsRoot) {
            args.push("--append-rom-bootargs='single=yes'");
        }

        if (!(await lookpath("stty"))) {
            args.push("-i");
        } else {
            args.push("-it");
        }

        await execa("docker", [...args, "--", "/bin/bash"], {
            stdio: "inherit",
        });
    }

    public async execute(): Promise<void> {
        // use pre-existing image or build dapp image
        const ext2Path = this.getContextPath("image.ext2");
        if (!fs.existsSync(ext2Path)) {
            throw new Error(`machine not built, run 'build'`);
        }

        // execute the machine and save snapshot
        await this.startShell(ext2Path);
    }
}
