import { getProjectName, getServiceState } from "../base.js";
import { getDeployments, type RollupsDeployment } from "../exec/rollups.js";

export type StatusOptions = {
    /**
     * Name of the project (used by docker compose and cartesi-rollups-node).
     * @default basename of the current working directory
     */
    projectName?: string;
};

export type StatusResult = {
    /** Name of the project the status refers to. */
    projectName: string;

    /** Whether the rollups node of the environment is running. */
    running: boolean;

    /** State of the rollups node container, as reported by docker compose. */
    state?: string;

    /** Applications deployed to the rollups node. */
    deployments: RollupsDeployment[];
};

/**
 * Query the status of a local environment, and the applications deployed to it.
 * @param options status options
 * @returns state of the environment and its deployments
 */
export const status = async (
    options: StatusOptions = {},
): Promise<StatusResult> => {
    const projectName = getProjectName(options);

    const state = await getServiceState({
        projectName,
        service: "rollups_node",
    });
    const deployments = await getDeployments({ projectName });

    return {
        projectName,
        running: state === "running",
        state,
        deployments,
    };
};
