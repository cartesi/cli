import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import Table from "cli-table3";
import { status } from "../api/status.js";

export const createStatusCommand = () => {
    return new Command("status")
        .description("Shows the status of a local environment.")
        .configureHelp({ showGlobalOptions: true })
        .option(
            "--project-name <string>",
            "name of project (used by docker compose and cartesi-rollups-node)",
        )
        .option("--json", "output in JSON format")
        .action(async (options) => {
            const { json } = options;

            const { deployments, projectName, running, state } =
                await status(options);

            if (json) {
                process.stdout.write(
                    JSON.stringify({
                        status: state,
                        deployments,
                    }),
                );
            } else {
                console.log(
                    `${chalk.cyan(projectName)} is ${running ? chalk.green("running") : chalk.red("not running")}`,
                );

                if (running) {
                    if (deployments.length === 0) {
                        console.log(chalk.red("no applications deployed"));
                    } else {
                        // print as a table
                        const table = new Table({
                            head: ["Machine", "Address", "Status", "Enabled"],
                            style: { border: [], head: [] },
                        });
                        table.push(
                            ...deployments.map((deployment) => [
                                deployment.templateHash,
                                deployment.address,
                                deployment.status,
                                deployment.enabled
                                    ? chalk.green("yes")
                                    : chalk.red("no"),
                            ]),
                        );
                        console.log(table.toString());
                    }
                }
            }
        });
};
