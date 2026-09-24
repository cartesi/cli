import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import Table from "cli-table3";
import { getProjectName, getServiceState } from "../base.js";
import {
    type ApplicationStatus,
    getDeployments,
    type RollupsDeployment,
    TERMINAL_APPLICATION_STATUSES,
} from "../exec/rollups.js";

/**
 * `OK` is healthy and `FAILED` is recoverable; the remaining statuses are
 * terminal and the node has stopped processing inputs for the application.
 */
const formatStatus = (status: ApplicationStatus) => {
    if (status === "OK") {
        return chalk.green(status);
    }
    return TERMINAL_APPLICATION_STATUSES.includes(status)
        ? chalk.red(status)
        : chalk.yellow(status);
};

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

            const projectName = getProjectName(options);

            const status = await getServiceState({
                projectName,
                service: "rollups_node",
            });
            const deployments = await getDeployments({
                projectName,
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
                    `${chalk.cyan(projectName)} is ${status === "running" ? chalk.green("running") : chalk.red("not running")}`,
                );

                if (status === "running") {
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
                                formatStatus(deployment.status),
                                deployment.enabled
                                    ? chalk.green("yes")
                                    : chalk.red("no"),
                            ]),
                        );
                        console.log(table.toString());

                        const unhealthy = deployments.filter(
                            (deployment: RollupsDeployment) =>
                                deployment.status !== "OK",
                        );

                        for (const deployment of unhealthy) {
                            if (deployment.reason) {
                                console.log(
                                    `${chalk.cyan(deployment.name)}: ${deployment.reason}`,
                                );
                            }
                        }

                        if (unhealthy.length > 0) {
                            console.log(
                                chalk.yellow(
                                    `run ${chalk.cyan("cartesi logs")} for details`,
                                ),
                            );
                        }
                    }
                }
            }
        });
};
