import { describe, expect, it } from "bun:test";
import path from "node:path";
import { defaultConfig } from "../../src/config.js";
import type { Config, ImageInfo } from "../../src/config.js";
import { cartesiMachine } from "../../src/exec/index.js";
import {
    buildMachineConfig,
    InvalidMemorySizeError,
    parseMemorySize,
} from "../../src/machine.js";

const RAM_IMAGE = "/images/linux.bin";
const CWD = "/app/.cartesi";

const build = (config: Config, info?: ImageInfo, interactive?: boolean) =>
    buildMachineConfig(config, info, {
        cwd: CWD,
        interactive,
        ramImage: RAM_IMAGE,
    });

const appConfig = (overrides: Partial<Config["machine"]> = {}): Config => {
    const config = defaultConfig();
    config.machine = {
        ...config.machine,
        entrypoint: "/bin/app",
        ...overrides,
    };
    return config;
};

describe("parseMemorySize", () => {
    it("should parse plain decimal and hexadecimal values", () => {
        expect(parseMemorySize("128")).toEqual(128n);
        expect(parseMemorySize("0")).toEqual(0n);
        expect(parseMemorySize("0x1000")).toEqual(4096n);
        expect(parseMemorySize("0X1000")).toEqual(4096n);
    });

    it("should parse IEC suffixes", () => {
        expect(parseMemorySize("1Ki")).toEqual(1024n);
        expect(parseMemorySize("128Mi")).toEqual(134217728n);
        expect(parseMemorySize("2Gi")).toEqual(2147483648n);
        expect(parseMemorySize("1Ti")).toEqual(1099511627776n);
    });

    it("should parse shifts", () => {
        expect(parseMemorySize("1 << 20")).toEqual(1048576n);
        expect(parseMemorySize("3<<10")).toEqual(3072n);
    });

    it("should reject invalid values", () => {
        expect(() => parseMemorySize("")).toThrow(InvalidMemorySizeError);
        expect(() => parseMemorySize("128MB")).toThrow(InvalidMemorySizeError);
        expect(() => parseMemorySize("abc")).toThrow(InvalidMemorySizeError);
        expect(() => parseMemorySize("1 << 64")).toThrow(
            InvalidMemorySizeError,
        );
    });
});

describe("buildMachineConfig", () => {
    it("should require an entrypoint", () => {
        const config = defaultConfig();
        expect(() => build(config)).toThrow("Undefined machine entrypoint");
    });

    it("should take the entrypoint from the docker image", () => {
        const config = defaultConfig();
        const info: ImageInfo = {
            cmd: ["--flag"],
            entrypoint: ["/bin/app"],
            env: [],
            workdir: "",
        };
        expect(build(config, info).config.dtb?.entrypoint).toEqual(
            "/bin/app --flag",
        );
    });

    it("should default the ram length to 128Mi", () => {
        expect(build(appConfig()).config.ram.length).toEqual(134217728);
    });

    it("should point the ram at the kernel image", () => {
        expect(
            build(appConfig()).config.ram.backing_store?.data_filename,
        ).toEqual(RAM_IMAGE);
    });

    it("should append the configured boot args to the emulator defaults", () => {
        const config = appConfig({ bootargs: ["loglevel=8", "quiet"] });
        const { dtb } = build(config).config;
        expect(dtb?.bootargs).toEqual(
            `${cartesiMachine.defaultConfig().dtb?.bootargs} loglevel=8 quiet`,
        );
    });

    it("should add a rootfstype boot arg for a squashfs root drive", () => {
        const config = appConfig();
        config.drives.root.format = "sqfs";
        expect(build(config).config.dtb?.bootargs).toContain(
            "rootfstype=squashfs",
        );
    });

    it("should not add a rootfstype boot arg when one is configured", () => {
        const config = appConfig({ bootargs: ["rootfstype=erofs"] });
        config.drives.root.format = "sqfs";
        const bootargs = build(config).config.dtb?.bootargs ?? "";
        expect(bootargs).toContain("rootfstype=erofs");
        expect(bootargs).not.toContain("rootfstype=squashfs");
    });

    it("should not mutate the configuration it is given", () => {
        const config = appConfig();
        config.drives.root.format = "sqfs";
        build(config);
        build(config);
        expect(config.machine.bootargs).toEqual([]);
    });

    it("should put the root drive first, so it lands on pmem0", () => {
        const config = appConfig();
        config.drives = {
            data: { builder: "empty", format: "ext2", size: 1024 },
            root: config.drives.root,
        };
        expect(build(config).config.flash_drive?.map((d) => d.label)).toEqual([
            "root",
            "data",
        ]);
    });

    it("should back each drive with its built image", () => {
        const config = appConfig();
        const [root] = build(config).config.flash_drive ?? [];
        expect(root.backing_store?.data_filename).toEqual(
            path.join(CWD, "root.ext2"),
        );
        expect(root.backing_store?.shared).toBeFalse();
        expect(root.length).toEqual(-1);
    });

    it("should mark shared drives as shared", () => {
        const config = appConfig();
        config.drives.root.shared = true;
        const [root] = build(config).config.flash_drive ?? [];
        expect(root.backing_store?.shared).toBeTrue();
    });

    it("should mount non-root drives at /mnt/<label> by default", () => {
        const config = appConfig();
        config.drives.data = { builder: "empty", format: "ext2", size: 1024 };
        const { init } = build(config).config.dtb ?? {};
        expect(init).toContain("dev=$(flashdrive data)\n");
        expect(init).toContain(
            'busybox mkdir -p "/mnt/data" && busybox mount "$dev" "/mnt/data"\n',
        );
    });

    it("should honor a custom mount point", () => {
        const config = appConfig();
        config.drives.data = {
            builder: "empty",
            format: "ext2",
            mount: "/var/data",
            size: 1024,
        };
        expect(build(config).config.dtb?.init).toContain(
            'busybox mkdir -p "/var/data" && busybox mount "$dev" "/var/data"\n',
        );
    });

    it("should not mount a drive with mount disabled", () => {
        const config = appConfig();
        config.drives.data = {
            builder: "empty",
            format: "ext2",
            mount: false,
            size: 1024,
        };
        expect(build(config).config.dtb?.init).not.toContain("busybox mount");
    });

    it("should chown a drive to its user", () => {
        const config = appConfig();
        config.drives.data = {
            builder: "empty",
            format: "ext2",
            size: 1024,
            user: "app",
        };
        expect(build(config).config.dtb?.init).toContain(
            'busybox chown app: "/mnt/data"\n',
        );
    });

    it("should chown an unmounted drive by device", () => {
        const config = appConfig();
        config.drives.data = {
            builder: "empty",
            format: "ext2",
            mount: false,
            size: 1024,
            user: "app",
        };
        expect(build(config).config.dtb?.init).toContain(
            'busybox chown app: "$dev"\n',
        );
    });

    it("should never mount the root drive, the kernel already did", () => {
        expect(build(appConfig()).config.dtb?.init).not.toContain(
            "flashdrive root",
        );
    });

    it("should export the configured environment variables", () => {
        const config = appConfig({ env: { GREETING: "hello world" } });
        expect(build(config).config.dtb?.init).toContain(
            'export GREETING="hello world"\n',
        );
    });

    it("should let the configured environment override the docker one", () => {
        const config = appConfig({ env: { LEVEL: "debug" } });
        const info: ImageInfo = {
            cmd: [],
            entrypoint: [],
            env: ["LEVEL=info", "PATH=/bin"],
            workdir: "",
        };
        const { init } = build(config, info).config.dtb ?? {};
        expect(init).toContain('export LEVEL="debug"\n');
        expect(init).toContain('export PATH="/bin"\n');
    });

    it("should ignore the docker environment when told to", () => {
        const config = appConfig({ useDockerEnv: false });
        const info: ImageInfo = {
            cmd: [],
            entrypoint: [],
            env: ["LEVEL=info"],
            workdir: "",
        };
        expect(build(config, info).config.dtb?.init).not.toContain("LEVEL");
    });

    it("should set the working directory from the docker image", () => {
        const info: ImageInfo = {
            cmd: [],
            entrypoint: [],
            env: [],
            workdir: "/app",
        };
        expect(build(appConfig(), info).config.dtb?.init).toContain(
            'WORKDIR="/app"\n',
        );
    });

    it("should ignore the docker working directory when told to", () => {
        const config = appConfig({ useDockerWorkdir: false });
        const info: ImageInfo = {
            cmd: [],
            entrypoint: [],
            env: [],
            workdir: "/app",
        };
        expect(build(config, info).config.dtb?.init).not.toContain("WORKDIR");
    });

    it("should set the user the entrypoint runs as", () => {
        const config = appConfig({ user: "app" });
        expect(build(config).config.dtb?.init).toEndWith("USER=app\n");
    });

    it("should be reproducible by default", () => {
        expect(build(appConfig()).config.processor?.registers?.iunrep).toEqual(
            0,
        );
        expect(build(appConfig()).runtimeConfig).toBeUndefined();
    });

    it("should use a virtio console when interactive", () => {
        const { config, runtimeConfig } = build(appConfig(), undefined, true);
        expect(config.processor?.registers?.iunrep).toEqual(1);
        expect(config.virtio).toEqual([{ type: "console" }]);
        expect(config.dtb?.bootargs).toContain("console=hvc1");
        expect(config.dtb?.bootargs).not.toContain("console=hvc0");
        expect(runtimeConfig?.console?.input_source).toEqual("from_stdin");
    });

    it("should sync the guest date when interactive", () => {
        const { config } = build(appConfig(), undefined, true);
        expect(config.dtb?.init).toMatch(/busybox date -s @\d+ >> \/dev\/null/);
    });
});
