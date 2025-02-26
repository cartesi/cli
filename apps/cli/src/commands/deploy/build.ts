import { Command, Option } from "@commander-js/extra-typings";
import { execa } from "execa";
import fs from "fs-extra";
import path from "path";
import { tmpNameSync } from "tmp";
import { getContextPath, getMachineHash, logPrompt } from "../../base.js";

const buildRollupsImage = async (platform?: string) => {
    const buildResult = tmpNameSync();
    const imagePath = getContextPath("image");
    const binPath = path.join(
        path.dirname(new URL(import.meta.url).pathname),
        "..",
        "..",
    );
    const dockerfile = path.join(binPath, "node", "DockerfileDeploy.txt");
    const args = [
        "buildx",
        "build",
        "-f",
        dockerfile,
        "--load",
        "--iidfile",
        buildResult,
        imagePath,
    ];

    // optional platform, default to not defining, which will build for the host platform
    if (platform) {
        args.push("--platform", platform);
    }

    await execa("docker", args, { stdio: "inherit" });
    return fs.readFileSync(buildResult, "utf8");
};

export const registerBuildCommand = (program: Command) => {
    program
        .command("build")
        .description(
            "Package the application in a Docker image ready to be deployed.",
        )
        .addOption(
            new Option(
                "--platform <platform>",
                "Docker image target platform",
            ).choices(["linux/amd64", "linux/arm64"]),
        )
        .option("--json", "Format output as json.")
        .action(async ({ platform, json }, command) => {
            // print machine hash
            const templateHash = getMachineHash();
            if (!templateHash) {
                command.error(
                    `Cartesi machine snapshot not found, run 'build'`,
                );
                return;
            }
            logPrompt({
                title: "Cartesi machine templateHash",
                value: templateHash,
            });
            console.log("Building application node Docker image...");

            const image = await buildRollupsImage(platform);
            logPrompt({
                title: "Application node Docker image",
                value: image,
            });

            if (json) {
                process.stdout.write(JSON.stringify({ image }));
            }
        });
};
