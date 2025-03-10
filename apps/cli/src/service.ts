import chalk from "chalk";

export const commaSeparatedList = (value: string) => value.split(",");

export const host = "http://127.0.0.1";

export type Service = {
    name: string; // name of the service
    file: string; // docker compose file name
    healthySemaphore?: string; // service to check if the service is healthy
    healthyTitle?: string | ((port: number) => string); // title of the service when it is healthy
    waitTitle?: string; // title of the service when it is starting
    errorTitle?: string; // title of the service when it is not healthy
};

// services configuration
// these are the sdervices common to both rollups and coprocessor
export const baseServices: Service[] = [
    {
        name: "anvil",
        file: "base/docker-compose-anvil.yaml",
        healthySemaphore: "anvil",
        healthyTitle: (port) =>
            `${chalk.cyan("anvil")} service ready at ${chalk.cyan(`${host}:${port}/anvil`)}`,
        waitTitle: `${chalk.cyan("anvil")} service starting...`,
        errorTitle: `${chalk.red("anvil")} service failed`,
    },
    {
        name: "proxy",
        file: "base/docker-compose-proxy.yaml",
    },
    {
        name: "database",
        file: "base/docker-compose-database.yaml",
    },
];
