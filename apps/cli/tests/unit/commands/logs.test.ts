import { describe, expect, it } from "bun:test";
import {
    buildLogsArgs,
    createLogsCommand,
    selectLogServices,
} from "../../../src/commands/logs";

describe("logs command", () => {
    // as `docker compose ps --services --all` lists an environment with a
    // pool sentry and a key-file sentry, whose installer has exited
    const services = [
        "anvil",
        "database",
        "proxy",
        "rollups_node",
        "secret-init-sentry-mine",
        "sentry-1",
        "sentry-mine",
    ];

    it("should take the services to show as arguments", () => {
        const [argument] = createLogsCommand().registeredArguments;

        expect(argument?.name()).toBe("service");
        expect(argument?.variadic).toBe(true);
        expect(argument?.required).toBe(false);
    });

    it("should show the node first, then the sentries, by default", () => {
        expect(selectLogServices(services, [])).toEqual([
            "rollups_node",
            "sentry-1",
            "sentry-mine",
        ]);
    });

    it("should show only the node without sentries", () => {
        expect(selectLogServices(["anvil", "rollups_node"], [])).toEqual([
            "rollups_node",
        ]);
    });

    it("should fail without the node", () => {
        expect(() => selectLogServices(["anvil", "sentry-1"], [])).toThrow(
            "service rollups_node not found",
        );
    });

    it("should show the services named, in that order", () => {
        expect(
            selectLogServices(services, ["sentry-mine", "rollups_node"]),
        ).toEqual(["sentry-mine", "rollups_node"]);
    });

    // compose shows nothing for an unknown service, without an error
    it("should reject a service the environment doesn't have", () => {
        expect(() =>
            selectLogServices(services, ["sentry-1", "sentry-2"]),
        ).toThrow(
            "service sentry-2 not found; the environment has anvil, database, proxy, rollups_node, secret-init-sentry-mine, sentry-1, sentry-mine",
        );
    });

    it("should pass the log options through, prefixing each service", () => {
        expect(
            buildLogsArgs({
                follow: true,
                projectName: "app",
                services: ["rollups_node", "sentry-1"],
                since: "42m",
                tail: "all",
                until: "1m",
            }),
        ).toEqual([
            "compose",
            "--project-name",
            "app",
            "logs",
            "--follow",
            "--since",
            "42m",
            "--tail",
            "all",
            "--until",
            "1m",
            "rollups_node",
            "sentry-1",
        ]);
    });

    // one service reads as `docker container logs` did
    it("should drop the prefix for one service", () => {
        expect(
            buildLogsArgs({ projectName: "app", services: ["rollups_node"] }),
        ).toEqual([
            "compose",
            "--project-name",
            "app",
            "logs",
            "--no-log-prefix",
            "rollups_node",
        ]);
    });
});
