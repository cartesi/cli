import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import Table from "cli-table3";
import { getServiceState } from "../base.js";
import { DEFAULT_COMPOSE_ENVIRONMENT_NAME } from "../config.js";
import { getDeployments } from "../exec/rollups.js";

export const createStatusCommand = () => {
    return new Command("status")
        .description("Shows the status of a local environment.")
        .configureHelp({ showGlobalOptions: true })
        .option(
            "--environment-name <string>",
            "name of environment",
            DEFAULT_COMPOSE_ENVIRONMENT_NAME,
        )
        .option("--json", "output in JSON format")
        .action(async ({ environmentName, json }, command) => {
            const status = await getServiceState({
                projectName: environmentName,
                service: "rollups-node",
            });
            const deployments = await getDeployments({
                projectName: environmentName,
            });

            if (json) {
                process.stdout.write(
                    JSON.stringify({
                        status,
                        deployments,
                    }),
                );
            } else {
                console.log(
                    `${chalk.cyan(environmentName)} is ${status === "running" ? chalk.green("running") : chalk.red("not running")}`,
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
