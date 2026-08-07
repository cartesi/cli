import { describe, expect, it } from "bun:test";
import { buildLogsArgs, selectLogServices } from "../../../src/api/logs";
import { createLogsCommand } from "../../../src/commands/logs";

describe("logs command", () => {
    // as `docker compose ps --services --all` lists an environment with a
    // pool node and a key-file node, whose installer has exited
    const services = [
        "anvil",
        "database",
        "prt-node-first",
        "prt-node-mine",
        "proxy",
        "rollups_node",
        "secret-init-prt-node-mine",
    ];

    it("should take the services to show as arguments", () => {
        const [argument] = createLogsCommand().registeredArguments;

        expect(argument?.name()).toBe("service");
        expect(argument?.variadic).toBe(true);
        expect(argument?.required).toBe(false);
    });

    it("should show the node first, then the PRT nodes, by default", () => {
        expect(selectLogServices(services, [])).toEqual([
            "rollups_node",
            "prt-node-first",
            "prt-node-mine",
        ]);
    });

    it("should show only the node without PRT nodes", () => {
        expect(selectLogServices(["anvil", "rollups_node"], [])).toEqual([
            "rollups_node",
        ]);
    });

    it("should fail without the node", () => {
        expect(() =>
            selectLogServices(["anvil", "prt-node-first"], []),
        ).toThrow("service rollups_node not found");
    });

    it("should show the services named, in that order", () => {
        expect(
            selectLogServices(services, ["prt-node-mine", "rollups_node"]),
        ).toEqual(["prt-node-mine", "rollups_node"]);
    });

    // compose shows nothing for an unknown service, without an error
    it("should reject a service the environment doesn't have", () => {
        expect(() =>
            selectLogServices(services, ["prt-node-first", "prt-node-second"]),
        ).toThrow(
            "service prt-node-second not found; the environment has anvil, database, prt-node-first, prt-node-mine, proxy, rollups_node, secret-init-prt-node-mine",
        );
    });

    it("should pass the log options through, prefixing each service", () => {
        expect(
            buildLogsArgs({
                follow: true,
                projectName: "app",
                services: ["rollups_node", "prt-node-first"],
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
            "prt-node-first",
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
