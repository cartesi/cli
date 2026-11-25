import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    baseEnvironment,
    isAlive,
    isGroupAlive,
    ProcessStartError,
    startProcess,
    stopProcess,
    stopProcessesSync,
    tailLog,
} from "../../../src/host/process";

describe("host processes", () => {
    let dir: string;

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "host-process-"));
    });

    afterAll(() => fs.rmSync(dir, { force: true, recursive: true }));

    it("should leave the CARTESI_ variables of the host out", () => {
        expect(
            baseEnvironment({ CARTESI_LOG_LEVEL: "debug", PATH: "/bin" }),
        ).toEqual({ PATH: "/bin" });
    });

    it("should write the output of a process to its log", async () => {
        const log = path.join(dir, "echo.log");
        const child = await startProcess(
            {
                args: ["-c", 'echo "out $GREETING"; echo err >&2'],
                command: "sh",
                env: { GREETING: "hello" },
                name: "echo",
            },
            log,
        );
        expect(await child.exited).toEqual({ code: 0, signal: null });
        expect(fs.readFileSync(log, "utf-8")).toBe("out hello\nerr\n");
        expect(tailLog(log, 1)).toBe("err");
    });

    it("should report a missing executable as such", async () => {
        await expect(
            startProcess(
                { args: [], command: "no-such-tool-xyz", name: "nothing" },
                path.join(dir, "missing.log"),
            ),
        ).rejects.toBeInstanceOf(ProcessStartError);
    });

    // the rollups node spawns its machines, which must go along with it
    it("should stop a process and the processes it started", async () => {
        const pidFile = path.join(dir, "grandchild.pid");
        const child = await startProcess(
            {
                args: ["-c", `sleep 60 & echo $! > ${pidFile}; wait`],
                command: "sh",
                name: "parent",
            },
            path.join(dir, "parent.log"),
        );
        while (!fs.existsSync(pidFile) || !fs.readFileSync(pidFile, "utf-8")) {
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        const grandchild = Number(fs.readFileSync(pidFile, "utf-8"));
        expect(isAlive(grandchild)).toBe(true);

        await stopProcess(child, 2_000);
        expect(isGroupAlive(child.pid)).toBe(false);
        expect(isAlive(grandchild)).toBe(false);
    });

    it("should kill what doesn't stop when asked", async () => {
        const child = await startProcess(
            {
                // ignores the stop signal
                args: ["-c", "trap '' TERM; sleep 60 & wait; sleep 60"],
                command: "sh",
                name: "stubborn",
            },
            path.join(dir, "stubborn.log"),
        );
        const start = Date.now();
        stopProcessesSync([child], 300);
        expect(Date.now() - start).toBeLessThan(2_000);
        await child.exited;
        expect(isGroupAlive(child.pid)).toBe(false);
    });
});
