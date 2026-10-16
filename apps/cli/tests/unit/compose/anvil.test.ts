import { describe, expect, it } from "bun:test";
import anvil from "../../../src/compose/anvil.js";

describe("compose anvil", () => {
    it("should run devnet with block time by default", () => {
        const { services } = anvil();
        expect(services?.anvil?.command).toEqual([
            "devnet",
            "--block-time",
            "2",
        ]);
    });

    it("should append extra args to devnet command", () => {
        const { services } = anvil({
            blockTime: 5,
            extraArgs: ["--slots-in-an-epoch=1", "--gas-limit", "60000000"],
        });
        expect(services?.anvil?.command).toEqual([
            "devnet",
            "--block-time",
            "5",
            "--slots-in-an-epoch=1",
            "--gas-limit",
            "60000000",
        ]);
    });

    it("should append extra args to fork command", () => {
        const { services } = anvil({
            forkConfig: {
                url: "http://localhost:8545",
                blockNumber: 10n,
                chainId: 1,
            },
            extraArgs: ["--slots-in-an-epoch=1"],
        });
        expect(services?.anvil?.command).toEqual([
            "anvil",
            "--chain-id",
            "31337",
            "--block-time",
            "2",
            "--fork-url",
            "http://localhost:8545",
            "--fork-block-number",
            "10",
            "--slots-in-an-epoch=1",
        ]);
    });
});
