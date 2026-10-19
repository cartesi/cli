import { describe, expect, it } from "bun:test";
import { resolveRunOptions } from "../../../src/api/run.js";
import { DEFAULT_SDK_VERSION } from "../../../src/config/index.js";

describe("api/run", () => {
    describe("resolveRunOptions", () => {
        it("should fall back to the defaults", () => {
            expect(resolveRunOptions({})).toEqual({
                blockTime: 2,
                claimStagingPeriod: 0,
                cpus: undefined,
                defaultBlock: "latest",
                epochLength: 720,
                forkBlockNumber: undefined,
                forkUrl: undefined,
                memory: undefined,
                port: undefined,
                projectName: undefined,
                prt: false,
                runtimeVersion: DEFAULT_SDK_VERSION,
                services: [],
                verbose: false,
            });
        });

        it("should take the values of the configuration", () => {
            const resolved = resolveRunOptions(
                {},
                {
                    blockTime: 1,
                    defaultBlock: "finalized",
                    epochLength: 10,
                    forkUrl: "https://rpc.example.com",
                    port: 8080,
                    projectName: "my-app",
                    prt: true,
                    services: ["explorer"],
                },
            );
            expect(resolved).toMatchObject({
                blockTime: 1,
                defaultBlock: "finalized",
                epochLength: 10,
                forkUrl: "https://rpc.example.com",
                port: 8080,
                projectName: "my-app",
                prt: true,
                services: ["explorer"],
            });
            // not set anywhere, so still the default
            expect(resolved.claimStagingPeriod).toBe(0);
        });

        it("should let the options take precedence over the configuration", () => {
            const resolved = resolveRunOptions(
                {
                    blockTime: 5,
                    epochLength: 100,
                    projectName: "from-option",
                    services: [],
                },
                {
                    blockTime: 1,
                    epochLength: 10,
                    projectName: "from-config",
                    services: ["explorer"],
                },
            );
            expect(resolved).toMatchObject({
                blockTime: 5,
                epochLength: 100,
                projectName: "from-option",
                // an empty list is a value, and does not fall back
                services: [],
            });
        });

        it("should let a falsy option override the configuration", () => {
            expect(
                resolveRunOptions(
                    { blockTime: 0, prt: false },
                    { blockTime: 1, prt: true },
                ),
            ).toMatchObject({ blockTime: 0, prt: false });
        });

        it("should resolve a free port later when none is given", () => {
            // zero is not a usable port, and neither is it a request for one
            expect(resolveRunOptions({ port: 0 }, { port: 0 }).port).toBe(0);
            expect(resolveRunOptions({}, {}).port).toBeUndefined();
        });

        it("should be verbose when the progress is verbose", () => {
            expect(resolveRunOptions({ progress: "verbose" }).verbose).toBe(
                true,
            );
            expect(
                resolveRunOptions({ progress: "verbose" }, { verbose: false })
                    .verbose,
            ).toBe(false);
            expect(resolveRunOptions({}, { verbose: true }).verbose).toBe(true);
        });
    });
});
