import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    AVAILABLE_SERVICES,
    selectServices,
} from "../../../src/host/environment";
import {
    assertHostTools,
    checkTool,
    findExecutable,
    MissingHostToolsError,
    parseToolVersion,
} from "../../../src/host/tools";

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
    let bin: string;

    /** A fake tool, which prints `output` whatever it is asked. */
    const fakeTool = (name: string, output: string) => {
        const file = path.join(bin, name);
        fs.writeFileSync(file, `#!/bin/sh\necho '${output}'\n`, {
            mode: 0o755,
        });
    };

    beforeAll(() => {
        bin = fs.mkdtempSync(path.join(os.tmpdir(), "host-tools-"));
        fakeTool("anvil", "anvil Version: 1.5.1-v1.5.1\nCommit SHA: abc");
        fakeTool(
            "cartesi-rollups-node",
            "cartesi-rollups-node version 2.0.0-alpha.9",
        );
        fakeTool("cartesi-rollups-cli", "nothing to see");
    });

    afterAll(() => fs.rmSync(bin, { force: true, recursive: true }));

    it("should find an executable in the PATH", () => {
        expect(findExecutable("sh")).toBeDefined();
        expect(findExecutable("sh", { PATH: "" })).toBeUndefined();
    });

    it("should read the version each tool reports", () => {
        expect(
            parseToolVersion(
                "anvil Version: 1.5.1-v1.5.1",
                /anvil Version: (\S+)/,
            ),
        ).toBe("1.5.1");
        expect(
            parseToolVersion(
                "postgres (PostgreSQL) 18.7",
                /\(PostgreSQL\) (\S+)/,
            ),
        ).toBe("18.7.0");
        expect(
            parseToolVersion(
                "cartesi-rollups-node version 2.0.0-alpha.14",
                /version (\S+)/,
            ),
        ).toBe("2.0.0-alpha.14");
        expect(parseToolVersion("hello", /version (\S+)/)).toBeUndefined();
    });

    it("should accept a supported version", async () => {
        const check = await checkTool("anvil", { PATH: bin });
        expect(check.version).toBe("1.5.1");
        expect(check.warning).toBeUndefined();
    });

    it("should warn of a version that is not supported", async () => {
        expect(
            await assertHostTools(
                ["anvil", "cartesi-rollups-node", "cartesi-rollups-cli"],
                { env: { PATH: bin } },
            ),
        ).toEqual([
            "cartesi-rollups-node 2.0.0-alpha.9 found, but ~2.0.0-alpha.14 is supported",
            "cartesi-rollups-cli didn't tell its version, ~2.0.0-alpha.14 is supported",
        ]);
    });

    it("should not run the tools when only their presence is checked", async () => {
        expect(
            await assertHostTools(["cartesi-rollups-node"], {
                env: { PATH: bin },
                versions: false,
            }),
        ).toEqual([]);
    });

    it("should name every missing tool, and what to install", async () => {
        const error = await assertHostTools(
            ["anvil", "cartesi-sling-node", "postgres"],
            { env: { PATH: "/nonexistent" } },
        ).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(MissingHostToolsError);
        expect((error as MissingHostToolsError).missing).toEqual([
            "anvil",
            "cartesi-sling-node",
            "postgres",
        ]);
        const { message } = error as Error;
        expect(message).toContain("these are not installed");
        expect(message).toContain(
            "  anvil               foundry 1.5.1: https://getfoundry.sh",
        );
        expect(message).toContain("cartesi doctor");
    });
});
