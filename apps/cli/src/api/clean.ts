import fs from "fs-extra";
import { getContextPath } from "../base.js";

/**
 * Delete all cached build artifacts of the application, by emptying the
 * `.cartesi` directory of the current working directory.
 */
export const clean = async (): Promise<void> => {
    await fs.emptyDir(getContextPath());
};
