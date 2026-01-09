import fs from "fs-extra";
import os from "node:os";
import path from "node:path";

export const createTempDir = async () => {
    const ostmpdir = os.tmpdir();
    const tmpdir = path.join(ostmpdir, "unit-test-");
    return await fs.mkdtemp(tmpdir);
};

export const cleanupTempDir = async (dir: string) => {
    await fs.rm(dir, { recursive: true });
};
