import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import Table from "cli-table3";
import { getServiceState } from "../../base.js";
import { getDeployments } from "../../exec/rollups.js";

export const registerStatusCommand = (program: Command) => {
    program
        .command("status")
        .description("Shows the status of a local rollups node environment.")
        .option(
            "--project-name <string>",
            "name of environment",
            "cartesi-rollups",
        )
        .option("--json", "output in JSON format")
        .action(async ({ json, projectName }) => {
            const status = await getServiceState(projectName, "rollups-node");
            const deployments = await getDeployments({ projectName });

            if (json) {
                process.stdout.write(
                    JSON.stringify({
                        status,
                        deployments,
                    }),
                );
            } else {
                console.log(
                    `${chalk.cyan(projectName)} is ${status == "running" ? chalk.green("running") : chalk.red("not running")}`,
                );

                if (status === "running") {
                    if (deployments.length === 0) {
                        console.log(chalk.red("no applications deployed"));
                    } else {
                        // print as a table
                        const table = new Table({
                            head: ["Machine", "Address", "State"],
                            style: { border: [], head: [] },
                        });
                        table.push(
                            ...deployments.map((deployment) => [
                                deployment.templateHash,
                                deployment.address,
                                deployment.state,
                            ]),
                        );
                        console.log(table.toString());
                    }
                }
            }
        });
};
