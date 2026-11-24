import { describe, expect, it } from "bun:test";
import { type EnvironmentState, serviceState } from "../../../src/host/state";

describe("serviceState", () => {
    const state = (pid: number, processes: EnvironmentState["processes"]) =>
        ({ pid, processes }) as EnvironmentState;
    const dead = 2 ** 22 + 1;

    it("should know nothing of a project that never ran", () => {
        expect(serviceState(undefined, "rollups_node")).toBeUndefined();
    });

    it("should know nothing of a service the environment doesn't run", () => {
        expect(serviceState(state(process.pid, []), "bundler")).toBeUndefined();
    });

    it("should report a service whose process is gone as exited", () => {
        const processes = [
            { log: "", name: "rollups_node", pid: dead, stopSignal: "SIGTERM" },
        ] as EnvironmentState["processes"];
        expect(
            serviceState(state(process.pid, processes), "rollups_node"),
        ).toBe("exited");
    });

    // the owner serves the proxy, without it nothing is reachable
    it("should report every service exited when the owner died", () => {
        const processes = [
            {
                log: "",
                name: "rollups_node",
                pid: process.pid,
                stopSignal: "SIGTERM",
            },
        ] as EnvironmentState["processes"];
        expect(serviceState(state(dead, processes), "rollups_node")).toBe(
            "exited",
        );
    });
});
