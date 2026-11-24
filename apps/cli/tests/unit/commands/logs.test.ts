import { describe, expect, it } from "bun:test";
import {
    linePrefix,
    selectLogServices,
    tailLines,
} from "../../../src/api/logs";
import { createLogsCommand } from "../../../src/commands/logs";

describe("logs command", () => {
    // as an environment lists its services, with a pool node and a key-file
    // node
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

    it("should show the last lines of a log", () => {
        const content = "one\ntwo\nthree\n";
        expect(tailLines(content, "all")).toEqual(["one", "two", "three"]);
        expect(tailLines(content, "2")).toEqual(["two", "three"]);
        expect(tailLines(content, "0")).toEqual([]);
        expect(tailLines("", "all")).toEqual([]);
    });

    it("should reject a tail that is not a number", () => {
        expect(() => tailLines("one\n", "some")).toThrow("invalid --tail some");
    });

    // one service reads as it is, more get a prefix, as compose did
    it("should prefix each service only when there is more than one", () => {
        expect(linePrefix(["rollups_node"], "rollups_node")).toBe("");
        expect(
            linePrefix(["rollups_node", "prt-node-first"], "rollups_node"),
        ).toBe("rollups_node    | ");
        expect(
            linePrefix(["rollups_node", "prt-node-first"], "prt-node-first"),
        ).toBe("prt-node-first  | ");
    });
});
