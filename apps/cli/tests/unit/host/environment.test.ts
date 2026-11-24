import { describe, expect, it } from "bun:test";
import {
    AVAILABLE_SERVICES,
    selectServices,
} from "../../../src/host/environment";
import { assertHostTools, findExecutable } from "../../../src/host/tools";

describe("selectServices", () => {
    it("should select every optional service with all", () => {
        expect(selectServices(["all"])).toEqual(AVAILABLE_SERVICES);
    });

    it("should start the bundler the paymaster sends to", () => {
        expect(selectServices(["paymaster"])).toEqual(["paymaster", "bundler"]);
    });

    it("should explain the explorer is not available", () => {
        expect(() => selectServices(["explorer"])).toThrow(
            "only available as a docker image",
        );
    });

    it("should reject an unknown service", () => {
        expect(() => selectServices(["bundler", "indexer"])).toThrow(
            "unknown service indexer, expected one of bundler, paymaster, passkey",
        );
    });
});

describe("host tools", () => {
    it("should find an executable in the PATH", () => {
        expect(findExecutable("sh")).toBeDefined();
        expect(findExecutable("sh", { PATH: "" })).toBeUndefined();
    });

    it("should name every missing tool, and what to install", () => {
        expect(() =>
            assertHostTools(["sh", "anvil", "cartesi-rollups-node"], {
                PATH: "/nonexistent",
            }),
        ).toThrow(
            [
                "cartesi run runs the environment on the host, which is missing:",
                "  sh",
                "  anvil: install foundry (https://getfoundry.sh)",
                "  cartesi-rollups-node: install the cartesi rollups node (https://github.com/cartesi/rollups-node/releases)",
            ].join("\n"),
        );
    });
});
