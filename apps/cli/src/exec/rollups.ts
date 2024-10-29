import { execa } from "execa";
import { Address, Hash } from "viem";
import { getMachineHash } from "../base.js";

export type RollupsDeployment = {
    id: number;
    name: string;
    address: Address;
    templateHash: Hash;
    epochLength: number;
    state: "ENABLED" | "DISABLED";
};

type ComposeParams = {
    projectName?: string;
};

export const getDeployments = async (
    options?: ComposeParams,
): Promise<RollupsDeployment[]> => {
    const projectName = options?.projectName ?? "cartesi-rollups";
    try {
        const { stdout } = await execa("docker", [
            "compose",
            "--project-name",
            projectName,
            "exec",
            "rollups-node",
            "cartesi-rollups-cli",
            "app",
            "list",
        ]);
        return JSON.parse(stdout).map((deployment: any) => ({
            id: deployment.ID,
            name: deployment.Name,
            address: deployment.IApplicationAddress,
            templateHash: deployment.TemplateHash,
            epochLength: deployment.EpochLength,
            state: deployment.State,
        }));
    } catch (e: unknown) {
        return [];
    }
};

export const getApplicationDeployment = async (
    options?: ComposeParams,
): Promise<RollupsDeployment | undefined> => {
    const machineHash = getMachineHash();
    if (!machineHash) {
        return undefined;
    }
    const deployments = await getDeployments(options);
    return deployments.find(
        (deployment) => deployment.templateHash === machineHash,
    );
};

export const getApplicationAddress = async (): Promise<Address | undefined> => {
    const deployment = await getApplicationDeployment();
    return deployment?.address;
};
