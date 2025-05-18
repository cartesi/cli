import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

interface TmpDirFixture {
    tmpdir: string;
}

const createTempDir = async () => {
    const ostmpdir = os.tmpdir();
    const tmpdir = path.join(ostmpdir, "unit-test-");
    return await fs.mkdtemp(tmpdir);
};

export const tmpdirTest = test.extend<TmpDirFixture>({
    tmpdir: async ({}, use) => {
        const directory = await createTempDir();
        await use(directory);
        await fs.rm(directory, { recursive: true });
    },
});
