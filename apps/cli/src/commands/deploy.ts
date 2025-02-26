import { Command, Option } from "@commander-js/extra-typings";
import confirm from "@inquirer/confirm";
import select from "@inquirer/select";
import chalk from "chalk";
import open, { apps } from "open";
import { getMachineHash, logPrompt } from "../base.js";
import { registerBuildCommand } from "./deploy/build.js";

export const registerDeployCommand = (program: Command) => {
    const deployCommand = program
        .command("deploy")
        .description(
            "Package and deploy the application to a supported live network.",
        )
        .addOption(
            new Option("--hosting <hosting>", "hosting type").choices([
                "self-hosted",
                "third-party",
            ]),
        )
        .addOption(
            new Option(
                "--webapp <webapp>",
                "webapp address",
            ).makeOptionMandatory(),
        )
        .action(async (options, command) => {
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

            // ask for deployment type
            const hosting =
                options.hosting ||
                (await select<"self-hosted" | "third-party">({
                    message: "Select hosting type",
                    choices: [
                        {
                            name: "Self-hosting",
                            description: `Select this option if you want to run the node for your application.
You will need the following infrastructure:

- a cloud server for the application node
- a postgres database
- a web3 node provider
- a funded wallet
`,
                            value: "self-hosted",
                        },
                        {
                            name: "Use third-party provider",
                            description:
                                "Select this option to use a third-party service provider to run a node for your application.",
                            value: "third-party",
                            disabled: "(coming soon)",
                        },
                    ],
                }));

            let queryString = "";
            switch (hosting) {
                case "self-hosted": {
                    // build docker image
                    // Execute the build subcommand
                    program.commands
                        .find((cmd) => cmd.name() === "build")
                        ?.parseAsync(program.args);

                    queryString = `?templateHash=${templateHash}`;
                    break;
                }
                case "third-party": {
                    command.error(
                        "Third-party provider deployment not supported yet",
                    );
                }
            }

            // prompt user to open webapp for onchain deployment
            const deployUrl = `${options.webapp}${queryString}`;
            if (await confirm({ message: `Open ${chalk.cyan(deployUrl)}?` })) {
                open(deployUrl, { app: { name: apps.chrome } });
            }

            return;
        });
    registerBuildCommand(deployCommand);
};
