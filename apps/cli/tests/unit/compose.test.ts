import { describe, expect, it } from "vitest";
import { ComposeBuilder } from "../../src/compose/builder.js";
import { Config } from "../../src/types/compose.js";

describe("ComposeBuilder", () => {
    describe("when using withName()", () => {
        it("should set the name correctly", () => {
            const builder = new ComposeBuilder().withName("test-name");
            const compose = builder.buildComposeFile();
            expect(compose.name).toEqual("test-name");
        });

        it("should override the name if called multiple times", () => {
            const builder = new ComposeBuilder().withName("second-name");
            const compose = builder.buildComposeFile();

            expect(compose.name).toEqual("second-name");
        });
    });

    describe("when using reset()", () => {
        it("should reset the builder state", () => {
            const builder = new ComposeBuilder().withName("test-name");
            builder.reset();
            const compose = builder.buildComposeFile();

            expect(compose.name).toBeUndefined();
        });
    });

    describe("when using withConfig()", () => {
        it("should set the config correctly", () => {
            const config: Config = {
                name: "my-config",
                content: "my content\n new line",
            };
            const compose = new ComposeBuilder().withConfig(config).buildComposeFile();

            expect(compose.configs!["my-config"].content).toContain("content");
        });
    });

    describe("when using withAnvil()", () => {
        it("should have the default image with empty options", () => {
            const compose = new ComposeBuilder().withAnvil().buildComposeFile();
            expect(compose.services!["anvil"].image).toEqual("cartesi/sdk:latest");
        });

        it("should set the block time correctly", () => {
            const compose = new ComposeBuilder().withAnvil({blockTime: 7}).buildComposeFile();
            expect(compose.services!["anvil"].command).toContain(
                "--block-time=7",
            );
        });

        it("should have the defined image tag", () => {
            const composeWithTag = new ComposeBuilder().withAnvil({imageTag: "v1.0.0"}).buildComposeFile();

            expect(composeWithTag.services!["anvil"].image).toEqual(
                "cartesi/sdk:v1.0.0",
            );
        });

        it("should define a config named anvil-proxy", () => {
            const compose = new ComposeBuilder().withAnvil().buildComposeFile();
            expect(compose.configs!["anvil-proxy"].content).toBeDefined();
        });
    });

    describe("when using withProxy()", () => {
        it("should have traefik:latest by default", () => {
            const compose = new ComposeBuilder().withProxy().buildComposeFile();
            expect(compose.services!["proxy"].image).toBe("traefik:latest");
        });

        it("should have the defined image tag", () => {
            const composeWithTag = new ComposeBuilder().withProxy({imageTag: "v2.5.0"}).buildComposeFile();

            expect(composeWithTag.services!["proxy"].image).toEqual(
                "traefik:v2.5.0",
            );
        });

        it("should listen on the defined port", () => {
            const compose = new ComposeBuilder().withProxy().buildComposeFile();
            expect(compose.services!["proxy"].ports).toContain("6751:8088");
        });

        it("should have a single port mapping", () => {
            const compose = new ComposeBuilder().withProxy().buildComposeFile();
            expect(compose.services!["proxy"].ports!.length).toBe(1);
        });

        it("should expose the defined listen port", () => {
            const compose = new ComposeBuilder().withProxy({listenPort: 9090}).buildComposeFile();
            expect(compose.services!["proxy"].ports).toContain("9090:8088");
        });
    });

    describe("when using withRollupsNode()", () => {
        it("should have the defined image tag", () => {
            const compose = new ComposeBuilder().withRollupsNode({imageTag: "v0.5.0"}).buildComposeFile();
            expect(compose.services!["rollups-node"].image).toEqual("cartesi/rollups-runtime:v0.5.0");
        });

        it("should define a config for proxy", () => {
            const compose = new ComposeBuilder().withRollupsNode().buildComposeFile();
            expect(compose.configs!["rollups-node-proxy"].content).toBeDefined();
        });

        it("should have its dependencies set", () => {
            const compose = new ComposeBuilder().withRollupsNode().buildComposeFile();
            expect(compose.services!["anvil"]).toBeDefined();
            expect(compose.services!["database"]).toBeDefined();
        });

        it("should allow cpu and memory limits to be set", () => {
            const compose = new ComposeBuilder()
                .withRollupsNode({
                    cpus: 1.5,
                    memory: 512,
                })
                .buildComposeFile();
            expect(compose.services!["rollups-node"].deploy!.resources!.limits).toEqual({
                cpus: "1.5",
                memory: "512M",
            });
        });
    });

    describe("when using withDatabase()", () => {
        it("should have default image with empty options", () => {
            const compose = new ComposeBuilder().withDatabase().buildComposeFile();
            expect(compose.services!["database"].image).toEqual("cartesi/rollups-database:latest");
        });

        it("should have the defined image tag", () => {
            const compose = new ComposeBuilder().withDatabase({imageTag: "v2.0.0"}).buildComposeFile();
            expect(compose.services!["database"].image).toEqual("cartesi/rollups-database:v2.0.0");
        });
    });

    describe("when using withExplorer()", () => {
        it("should have the default image with empty options", () => {
            const compose = new ComposeBuilder().withExplorer().buildComposeFile();
            expect(compose.services!["explorer"].image).toEqual("cartesi/rollups-explorer:latest");
        });

        it("should have the defined image tag", () => {
            const compose = new ComposeBuilder().withExplorer({imageTag: "v1.2.3"}).buildComposeFile();
            expect(compose.services!["explorer"].image).toEqual("cartesi/rollups-explorer:v1.2.3");
        });

        it("should have its dependencies set", () => {
            const compose = new ComposeBuilder().withExplorer().buildComposeFile();
            expect(compose.services!["database"]).toBeDefined();
        });

        it("should be configured to connect to exposed proxy port", () => {
            const compose = new ComposeBuilder().withExplorer({listenPort: 8081}).withProxy({listenPort: 8081}).buildComposeFile();
            expect((compose.services!["explorer"].environment as Record<string, string>)!["NODE_RPC_URL"]).toContain("8081");
            expect((compose.services!["explorer"].environment as Record<string, string>)!["EXPLORER_API_URL"]).toContain("8081");
        });

        it("should persist custom changes after the second empty call", () => {
            const compose = new ComposeBuilder()
                .withExplorer({imageTag: "v3.3.3", listenPort: 8082})
                .withExplorer()
                .buildComposeFile();
            expect(compose.services!["explorer"].image).toEqual("cartesi/rollups-explorer:v3.3.3");
            expect((compose.services!["explorer"].environment as Record<string, string>)!["NODE_RPC_URL"]).toContain("8082");
            expect((compose.services!["explorer"].environment as Record<string, string>)!["EXPLORER_API_URL"]).toContain("8082");
        });

        it("should define a config named explorer-proxy", () => {
            const compose = new ComposeBuilder().withExplorer().buildComposeFile();
            expect(compose.configs!["explorer-proxy"].content).toBeDefined();
        });
    });

    describe("when using withExplorerApi()", () => {
        it("should have the default image with empty options", () => {
            const compose = new ComposeBuilder().withExplorerApi().buildComposeFile();
            expect(compose.services!["explorer-api"].image).toEqual("cartesi/rollups-explorer-api:latest");
        });

        it("should have the defined image tag", () => {
            const compose = new ComposeBuilder().withExplorerApi({imageTag: "v0.9.0"}).buildComposeFile();
            expect(compose.services!["explorer-api"].image).toEqual("cartesi/rollups-explorer-api:v0.9.0");
        });

        it("should have its dependencies set", () => {
            const compose = new ComposeBuilder().withExplorerApi().buildComposeFile();
            expect(compose.services!["database"]).toBeDefined();
            expect(compose.services!["squid-processor"]).toBeDefined();
        });

        it("should define a config named explorer-api-proxy", () => {
            const compose = new ComposeBuilder().withExplorerApi().buildComposeFile();
            expect(compose.configs!["explorer-api-proxy"].content).toBeDefined();
        });
    });

    describe("when using withSquidProcessor()", () => {
        it("should have the default image with empty options", () => {
            const compose = new ComposeBuilder().withSquidProcessor().buildComposeFile();
            expect(compose.services!["squid-processor"].image).toEqual("cartesi/rollups-explorer-api:latest");
        });

        it("should have the defined image tag", () => {
            const compose = new ComposeBuilder().withSquidProcessor({imageTag: "v1.1.1"}).buildComposeFile();
            expect(compose.services!["squid-processor"].image).toEqual("cartesi/rollups-explorer-api:v1.1.1");
        });

        it("should have its dependencies set", () => {
            const compose = new ComposeBuilder().withSquidProcessor().buildComposeFile();
            expect(compose.services!["database"]).toBeDefined();
        });
    });

    describe("when using withBundler()", () => {
        it("should have the default image with empty options", () => {
            const compose = new ComposeBuilder().withBundler().buildComposeFile();
            expect(compose.services!["bundler"].image).toEqual("cartesi/sdk:latest");
        });

        it("should have the defined image tag", () => {
            const compose = new ComposeBuilder().withBundler({imageTag: "v2.1.0"}).buildComposeFile();
            expect(compose.services!["bundler"].image).toEqual("cartesi/sdk:v2.1.0");
        });

        it("should define a config named bundler-proxy", () => {
            const compose = new ComposeBuilder().withBundler().buildComposeFile();
            expect(compose.configs!["bundler-proxy"].content).toBeDefined();
        });
    });

    describe("when using withPaymaster()", () => {
        it("should have the default image with empty options", () => {
            const compose = new ComposeBuilder().withPaymaster().buildComposeFile();
            expect(compose.services!["paymaster"].image).toEqual("cartesi/sdk:latest");
        });

        it("should have the defined image tag", () => {
            const compose = new ComposeBuilder().withPaymaster({imageTag: "v3.0.0"}).buildComposeFile();
            expect(compose.services!["paymaster"].image).toEqual("cartesi/sdk:v3.0.0");
        });

        it("should define a config named paymaster-proxy", () => {
            const compose = new ComposeBuilder().withPaymaster().buildComposeFile();
            expect(compose.configs!["paymaster-proxy"].content).toBeDefined();
        });
    });

    describe("when using withPasskeyServer()", () => {
        it("should have the default image with empty options", () => {
            const compose = new ComposeBuilder().withPasskeyServer().buildComposeFile();
            expect(compose.services!["passkey-server"].image).toEqual("cartesi/sdk:latest");
        });

        it("should have the defined image tag", () => {
            const compose = new ComposeBuilder().withPasskeyServer({imageTag: "v4.0.0"}).buildComposeFile();
            expect(compose.services!["passkey-server"].image).toEqual("cartesi/sdk:v4.0.0");
        });

        it("should define a config named passkey-proxy", () => {
            const compose = new ComposeBuilder().withPasskeyServer().buildComposeFile();
            expect(compose.configs!["passkey-proxy"].content).toBeDefined();
        });
    });
});
