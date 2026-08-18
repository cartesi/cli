import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "fs-extra";
import path from "node:path";
import { satisfies } from "semver";
import { parse } from "../../../src/config.js";
import { cartesiMachine } from "../../../src/exec/index.js";
import { bootMachine } from "../../../src/machine.js";
import {
    createTemporaryCartesiApplication,
    ensureDockerImage,
    TEST_SDK,
} from "../config.js";

await ensureDockerImage(TEST_SDK);

// --nvram only exists from cartesi-machine 0.21.0. gating on the version rather than on
// CARTESI_TEST_SDK means this starts running on its own once DEFAULT_SDK_VERSION points at an
// image that supports it.
const found = await cartesiMachine.version({
    image: TEST_SDK,
    forceDocker: true,
});

const supported =
    found !== null && satisfies(found.format(), cartesiMachine.requiredVersion);

// sdk is set explicitly because bootMachine boots the image named by the config, not TEST_SDK
const CONFIG = `sdk = "${TEST_SDK}"

[nvrams.input]
size = "4Ki"

[nvrams.output]
size = "4Ki"
shared = true
user = "dapp"
` as const;

describe.skipIf(!supported)("when booting a machine with nvrams", () => {
    let app: Awaited<ReturnType<typeof createTemporaryCartesiApplication>>;
    let context: string;

    beforeAll(
        async () => {
            app = await createTemporaryCartesiApplication({ config: CONFIG });
            context = path.join(app.appDir, ".cartesi");
        },
        { timeout: 60000 * 20 },
    );

    afterAll(() => {
        app?.cleanup();
    });

    /**
     * Boots the built application with a different entrypoint, the way the shell command does.
     */
    const boot = async (command: string) => {
        const config = parse([CONFIG]);
        config.machine.entrypoint = command;

        // no interactive option, as -it needs a tty the test runner does not have
        const { stdout } = await bootMachine(
            config,
            undefined,
            {},
            {
                cwd: context,
            },
        );
        return stdout as string;
    };

    it("should only build an image for the nvrams that need one", async () => {
        const output = path.join(context, "output.raw");

        expect(await fs.readFile(output)).toEqual(Buffer.alloc(4096));
        // pristine, so cartesi-machine fills the range and there is nothing to build
        expect(fs.existsSync(path.join(context, "input.raw"))).toBeFalsy();
    });

    it("should expose one uio device per nvram", async () => {
        const stdout = await boot("ls /dev/uio*");

        expect(stdout).toContain("/dev/uio0");
        expect(stdout).toContain("/dev/uio1");
        expect(stdout).not.toContain("/dev/uio2");
    });

    it("should resolve the labels in configuration order", async () => {
        const stdout = await boot("nvram input; nvram output");

        // the boot splash comes first, so keep only the lines the nvram tool printed
        const devices = stdout
            .split("\n")
            .filter((line) => line.startsWith("/dev/uio"));
        expect(devices).toEqual(["/dev/uio0", "/dev/uio1"]);
    });

    it("should round-trip through a shared nvram", async () => {
        const stdout = await boot(
            "echo hello-nvram | writemmap output; readmmap output | head -c 11",
        );
        expect(stdout).toContain("hello-nvram");

        // shared, so the guest write reaches the backing image on the host
        const image = await fs.readFile(path.join(context, "output.raw"));
        expect(image.subarray(0, 11).toString()).toEqual("hello-nvram");
    });
});
