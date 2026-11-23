import { beforeAll, describe, expect, it } from "bun:test";
import { parse } from "semver";
import { doctor } from "../../../src/api/doctor.js";
import { cartesiMachine } from "../../../src/exec/index.js";
import { setupIntegrationTests } from "../config.js";

beforeAll(
    async () => {
        await setupIntegrationTests();
    },
    { timeout: 60000 },
);

describe("api/doctor", () => {
    it(
        "should accept the cartesi-machine the CLI would use",
        async () => {
            // doctor reads no cartesi.toml, so it checks the host binary or the
            // default sdk image, with the range the CLI applies
            const { checks } = await doctor();
            const check = checks.find(({ name }) => name === "Cartesi Machine");
            expect(check).toMatchObject({ status: "ok" });
            const found = parse(check?.detail);
            expect(found).not.toBeNull();
            expect(() => cartesiMachine.assertSupported(found)).not.toThrow();
        },
        { timeout: 60000 },
    );
});
