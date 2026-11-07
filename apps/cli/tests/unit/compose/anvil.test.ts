import { describe, expect, it } from "bun:test";
import buildAnvilCompose from "../../../src/compose/anvil.js";

describe("Compose anvil service", () => {
    // compose interpolates `$name` in the file it reads, so the URL must reach
    // it as `$$`, which compose turns back into `$`
    it("should escape the $ in the fork url for compose", () => {
        const compose = buildAnvilCompose({
            forkConfig: {
                blockNumber: 10n,
                chainId: 11155111,
                url: "https://rpc.example.com/v2/k$y",
            },
        });

        expect(compose.services?.anvil?.command).toEqual([
            "anvil",
            "--chain-id",
            "31337",
            "--block-time",
            "2",
            "--fork-url",
            "https://rpc.example.com/v2/k$$y",
            "--fork-block-number",
            "10",
        ]);
    });
});
