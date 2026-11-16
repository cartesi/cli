import { getCartesiEnvironmentVariables, getProjectName } from "../base.js";
import { getHostSigner, getNodeSigner } from "../exec/node-container.js";
import { getNodeWithdrawalConfig } from "../exec/rollups.js";
import { resolveForecloseSigner } from "../foreclose.js";
import { resolveNodeApplication } from "../node.js";
import {
    type RecoveryOptions,
    type RecoveryResult,
    runRecoveryCommand,
} from "./recovery.js";
import type { Notice } from "./types.js";

export type ForecloseOptions = RecoveryOptions & {
    /**
     * Index of the guardian in the mnemonic.
     * @default looked up from the application guardian; ignored for private-key signers
     */
    accountIndex?: number;

    /**
     * Called with what is worth telling about the signer, such as an account
     * index that is ignored. Nothing is written to the terminal without it.
     */
    onNotice?: (notice: Notice) => void;
};

/**
 * Foreclose an application, so its users can withdraw their funds. Signs as
 * the application guardian, with the rollups node signer by default, looking
 * up the guardian in its mnemonic. To sign as a guardian outside it, set
 * `CARTESI_AUTH_MNEMONIC` or `CARTESI_AUTH_PRIVATE_KEY`, and
 * `CARTESI_AUTH_KIND` when both are set.
 * @param options foreclose options
 * @returns the application foreclosed, and the output of cartesi-rollups-cli
 */
export const foreclose = async (
    options: ForecloseOptions = {},
): Promise<RecoveryResult> => {
    const { onNotice, stream = false } = options;
    const projectName = getProjectName(options);
    const application = await resolveNodeApplication({
        application: options.application,
        projectName,
    });

    const { guardian } = await getNodeWithdrawalConfig({
        application,
        projectName,
    });
    // the node signer is only needed without a signer for the command
    const host = getHostSigner(getCartesiEnvironmentVariables());
    const { accountIndex, env, warning } = resolveForecloseSigner({
        accountIndex: options.accountIndex,
        guardian,
        host,
        node: host ? undefined : await getNodeSigner({ projectName }),
    });
    if (warning) {
        onNotice?.({ level: "warning", message: warning });
    }

    const output = await runRecoveryCommand({
        accountIndex,
        command: ["cartesi-rollups-cli", "foreclose", application],
        env,
        projectName,
        stream,
        tx: options,
    });
    return { application, output };
};
