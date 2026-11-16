import chalk from "chalk";
import ora from "ora";
import type { Address } from "viem";
import type { ProgressOptions } from "../types.js";

// Kept apart from common.ts, whose declarations are public: the spinner's type
// comes from ora, a devDependency, which a consumer of the library types
// doesn't have.

/**
 * Create the spinner used to report the progress of a deposit, silent unless
 * the caller asked for progress.
 */
export const depositSpinner = (options: ProgressOptions) =>
    ora({ isSilent: (options.progress ?? "silent") === "silent" });

/** Label of an application address, used in progress messages. */
export const applicationLabel = (application: Address) =>
    chalk.cyan(application);
