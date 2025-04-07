import { execa } from "execa";
import { Address, Hash } from "viem";
import { getMachineHash } from "../base.js";

export type RollupsDeployment = {
    name: string;
    address: Address;
    templateHash: Hash;
    epochLength: number;
    state: "ENABLED" | "DISABLED";
};

type ComposeParams = {
    environmentName?: string;
};

export const getDeployments = async (
    options?: ComposeParams,
): Promise<RollupsDeployment[]> => {
    const environmentName = options?.environmentName ?? "cartesi-rollups";
    try {
        const { stdout } = await execa("docker", [
            "compose",
            "--project-name",
            environmentName,
            "exec",
            "rollups-node",
            "cartesi-rollups-cli",
            "app",
            "list",
        ]);
        return JSON.parse(stdout).map((deployment: any) => ({
            name: deployment.name,
            address: deployment.iapplication_address,
            templateHash: deployment.template_hash,
            epochLength: deployment.epoch_lenght,
            state: deployment.state,
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
