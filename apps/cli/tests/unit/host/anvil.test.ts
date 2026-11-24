import { describe, expect, it } from "bun:test";
import { anvilProcess } from "../../../src/host/anvil";

describe("anvil process", () => {
    it("should load the devnet state on the loopback interface", () => {
        expect(
            anvilProcess({
                blockTime: 2,
                port: 8545,
                state: "/cache/state.json",
            }).args,
        ).toEqual([
            "--host",
            "127.0.0.1",
            "--port",
            "8545",
            "--block-time",
            "2",
            "--load-state",
            "/cache/state.json",
            "--preserve-historical-states",
            "--max-persisted-states",
            "86400",
        ]);
    });

    // no compose in between, so a `$` in an API key needs no escaping
    it("should fork from the url as it is, with the devnet chain id", () => {
        const { args } = anvilProcess({
            blockTime: 1,
            forkConfig: {
                blockNumber: 42n,
                chainId: 1,
                url: "https://rpc.example/$key",
            },
            port: 8545,
        });
        expect(args).toContain("https://rpc.example/$key");
        expect(args.slice(-6)).toEqual([
            "--chain-id",
            "31337",
            "--fork-url",
            "https://rpc.example/$key",
            "--fork-block-number",
            "42",
        ]);
        expect(args).not.toContain("--load-state");
    });
});
